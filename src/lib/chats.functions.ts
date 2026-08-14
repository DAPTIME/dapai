import { dbError } from "./db-error";
import {
  CHAT_HISTORY_LIMIT as CHAT_LIMITS,
  TIER_LIMITS,
  MAX_IMAGES_PER_PROMPT,
  costOfPrompt,
  estimateTokens,
  isLedgerMissing,
} from "@/lib/usage-limits";
/**
 * Server functions for chats. All run as the authenticated user so RLS
 * scopes every read/write to that user's rows.
 *
 * Two models, two independent queues, two independent backend URLs:
 *   AI_BACKEND_URL_PRO   / AI_BACKEND_KEY_PRO    → dap-ai-1.0  (Pro)
 *   AI_BACKEND_URL_LITE  / AI_BACKEND_KEY_LITE   → dap-ai-lite (Lite)
 *
 * Legacy fallback: AI_BACKEND_URL / AI_BACKEND_KEY is used for either
 * model if the model-specific one isn't set, so older configs keep working.
 *
 * Chat memory limits per plan (oldest chats are auto-deleted on creation):
 *   free → 5 chats
 *   pro  → 10 chats
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  enqueue,
  isStopped,
  clearStopped,
  markStopped,
  registerAborter,
  unregisterAborter,
} from "@/lib/ai-queue";
import { hasLiteReasoningLeak, sanitizeLiteReply } from "@/lib/lite-sanitize";
import { resolveOllamaModel } from "@/lib/ollama-models.server";
import { MODEL_IDS, modelInfo, type ModelId } from "@/lib/models";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";



// Lite gets a smaller rolling window so its (smaller LM Studio context)
// never overflows. Pro keeps the full history.
const LITE_HISTORY_LIMIT = 12;

/**
 * Study Mode: turn the assistant into a Socratic tutor that never hands over
 * the whole answer up front.
 */
const STUDY_MODE_PROMPT =
  "STUDY MODE IS ON. Act as a Socratic tutor, not an answer machine. Rules: (1) Never give the full answer or final solution up front. (2) Work in ONE small step per reply, then stop and ask a single question that makes the student do the next step. (3) If the student is stuck, give a hint or a simpler sub-question — still not the answer. (4) If they get something wrong, say what's off and ask a question that leads them to fix it. (5) Only reveal the complete answer if the student explicitly asks for it twice, or has clearly reached it themselves — then confirm and summarise briefly. (6) Keep replies short (under 120 words) and encouraging. This overrides any instruction to be comprehensive.";

const LITE_NO_THINK_PROMPT =
  "You are a DAP AI 4 Lite-class model. Thinking mode is OFF. Answer with only the final user-facing response. Never write internal reasoning, planning, analysis, scratchpad, self-talk, or sentences like 'I need to'. Do not output <think> tags or explain how you will answer.";


/**
 * Meta-prompt layer: ask a fast Lovable AI model to draft a short
 * system-prompt addendum tailored to the current user request. Stacked
 * on top of the admin's base prompt (and any DAP prompt) before hitting
 * the local model. Best-effort — returns "" on any failure so chats
 * still go through.
 */
async function generateMetaPrompt(
  userText: string,
  basePrompt: string,
  dapName?: string
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite-preview",
          messages: [
            {
              role: "system",
              content:
                "You are a prompt engineer. Read the user's request and write a SHORT (<= 80 words) system-prompt addendum that primes the answering assistant for the best possible reply — domain expertise to adopt, format/structure hints, pitfalls to avoid, and tone. Output ONLY the addendum text. No preamble, no quotes, no headings.",
            },
            {
              role: "user",
              content: `Base assistant instructions:\n${basePrompt || "(none)"}${
                dapName ? `\n\nActive persona: ${dapName}` : ""
              }\n\nUser request:\n${userText}`,
            },
          ],
          stream: false,
        }),
      }
    );
    if (!res.ok) return "";
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return (json?.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Use a fast Lovable AI model to detect if the user's message contains a
 * durable personal fact worth remembering across chats (name, preferences,
 * job, location, ongoing project, etc.). Returns 0+ short memory strings.
 * Returns [] on any failure.
 */
async function extractMemories(
  userText: string,
  existing: string[]
): Promise<string[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite-preview",
          messages: [
            {
              role: "system",
              content:
                "Extract durable personal facts from the user message that an assistant should remember across future conversations (name, age, location, job, hobbies, preferences, ongoing projects, important relationships, etc.). Ignore one-off questions, requests, opinions about external topics, and anything ephemeral. Return STRICT JSON: {\"memories\": string[]}. Each memory is a short third-person fact under 140 chars (e.g. \"Lives in London\", \"Prefers concise answers\"). If nothing qualifies, return {\"memories\": []}. Do NOT duplicate facts already known.",
            },
            {
              role: "user",
              content: `Already known about user:\n${
                existing.length ? existing.map((m) => `- ${m}`).join("\n") : "(none)"
              }\n\nNew user message:\n${userText}`,
            },
          ],
          response_format: { type: "json_object" },
          stream: false,
        }),
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { memories?: unknown };
    if (!Array.isArray(parsed.memories)) return [];
    return parsed.memories
      .filter((m): m is string => typeof m === "string")
      .map((m) => m.trim())
      .filter((m) => m.length > 0 && m.length <= 200)
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Decide if the user's message needs fresh information from the web
 * (current events, "latest", prices, scores, recent releases, real-time
 * facts, anything time-sensitive). Returns a tight search query when yes,
 * null when no. Best-effort — returns null on failure.
 */
async function planWebSearch(userText: string): Promise<string | null> {
  // Hard override: if the user explicitly asks to search/look up/google
  // something, skip the classifier and search directly. This guarantees
  // that "search the web for X" always triggers Firecrawl even if the
  // classifier model is unavailable.
  const explicit =
    /\b(search (the )?(web|internet|online)|look (this |that |it )?up|google( it| this| that)?|browse the web|find (online|on the web)|web search|fact[- ]?check)\b/i;
  if (explicit.test(userText)) {
    // Strip the instruction phrase to make a tighter query.
    const cleaned = userText
      .replace(explicit, "")
      .replace(/\b(please|for me|can you|could you|i want you to|tell me)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const q = (cleaned.length > 0 ? cleaned : userText).slice(0, 200);
    return q;
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "Decide if answering the user's message correctly REQUIRES fresh internet information (current events, 'latest' / 'newest' / 'recent', live scores, today's prices, recent releases, news, who currently holds X, real-time facts), OR the user explicitly asks to search/look up/google something. If yes, produce a short Google-style search query. If the answer is timeless general knowledge, math, coding, opinions, or the model can answer from training, say no. Return STRICT JSON: {\"search\": boolean, \"query\": string}.",
            },
            { role: "user", content: userText },
          ],
          response_format: { type: "json_object" },
          stream: false,
        }),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { search?: boolean; query?: string };
    if (!parsed.search) return null;
    const q = (parsed.query ?? userText).trim();
    return q.length > 0 ? q.slice(0, 200) : null;
  } catch {
    return null;
  }
}

/**
 * Search the web via Firecrawl and return a compact, model-friendly
 * context block. Returns "" on failure.
 */
async function webSearchContext(query: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: 5 }),
    });
    if (!res.ok) return "";
    type Hit = { url?: string; title?: string; description?: string };
    const json = (await res.json()) as {
      data?: Hit[] | { web?: Hit[] };
    };
    const results: Hit[] = Array.isArray(json?.data)
      ? json.data
      : json?.data?.web ?? [];
    if (results.length === 0) return "";
    const lines = results.slice(0, 5).map((r: Hit, i: number) => {
      const title = (r.title ?? "").trim();
      const desc = (r.description ?? "").trim().slice(0, 300);
      const url = (r.url ?? "").trim();
      return `[${i + 1}] ${title}\n${desc}\n${url}`;
    });
    return `Live web search results for: "${query}"\nUse these to answer accurately. Cite sources inline like [1], [2] when relevant. If the results don't actually answer the question, say so honestly.\n\n${lines.join("\n\n")}`;
  } catch {
    return "";
  }
}

function backendFor(model: ModelId): {
  url?: string;
  key?: string;
  upstreamModel: string;
} {
  if (model === "dap-ai-1.0") {
    return {
      url: process.env.AI_BACKEND_URL_PRO ?? process.env.AI_BACKEND_URL,
      key: process.env.AI_BACKEND_KEY_PRO ?? process.env.AI_BACKEND_KEY,
      upstreamModel: process.env.AI_BACKEND_MODEL_PRO ?? model,
    };
  }
  if (model === "dap-ai-pro-lite") {
    // Pro Lite has its own backend when configured, otherwise it shares the
    // Lite tunnel so it keeps working out of the box.
    return {
      url:
        process.env.AI_BACKEND_URL_PRO_LITE ??
        process.env.AI_BACKEND_URL_LITE ??
        process.env.AI_BACKEND_URL,
      key:
        process.env.AI_BACKEND_KEY_PRO_LITE ??
        process.env.AI_BACKEND_KEY_LITE ??
        process.env.AI_BACKEND_KEY,
      upstreamModel:
        process.env.AI_BACKEND_MODEL_PRO_LITE ??
        process.env.AI_BACKEND_MODEL_LITE ??
        model,
    };
  }
  return {
    url: process.env.AI_BACKEND_URL_LITE ?? process.env.AI_BACKEND_URL,
    key: process.env.AI_BACKEND_KEY_LITE ?? process.env.AI_BACKEND_KEY,
    upstreamModel: process.env.AI_BACKEND_MODEL_LITE ?? model,
  };
}

/**
 * Client calls this BEFORE sendChatMessage so it can show a
 * "Searching the web…" indicator while the model is being primed.
 */
export const planSearchForMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ text: z.string().min(1).max(8000) }).parse(i)
  )
  .handler(async ({ data }) => {
    const query = await planWebSearch(data.text);
    return { query };
  });

export const listChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("chats")
      .select("id, title, created_at, updated_at")
      .eq("is_incognito", false)
      .order("updated_at", { ascending: false });
    if (error) throw dbError(error);
    return data;
  });

export const createChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        dapId: z.string().min(1).max(128).optional(),
        incognito: z.boolean().optional(),
      })
      .optional()
      .parse(i ?? {})
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Custom AI's (built-in or user-made) are a Pro-only feature.
    if (data?.dapId) {
      const { data: gateProfile } = await supabase
        .from("profiles")
        .select("tier")
        .eq("id", userId)
        .single();
      const gateTier = ((gateProfile?.tier as Tier) ?? "free");
      if (TIER_RANK[gateTier] < TIER_RANK.pro) {
        throw new Error("Custom AI's are a Pro feature. Upgrade to use them.");
      }
    }

    // Resolve built-in or custom DAP. Custom IDs are prefixed "custom:<uuid>".
    let dap:
      | { name: string; emoji: string; systemPrompt: string; opener: string }
      | undefined;

    if (data?.dapId?.startsWith("custom:")) {
      const customId = data.dapId.slice("custom:".length);
      const { data: row } = await supabase
        .from("custom_daps")
        .select("name, emoji, system_prompt, opener")
        .eq("id", customId)
        .eq("user_id", userId)
        .maybeSingle();
      if (row) {
        dap = {
          name: row.name,
          emoji: row.emoji,
          systemPrompt: row.system_prompt,
          opener: row.opener || `Hi — I'm **${row.name}**. How can I help?`,
        };
      }
    } else if (data?.dapId) {
      const { DAPS } = await import("@/lib/daps");
      const found = DAPS.find((g) => g.id === data.dapId);
      if (found) {
        dap = {
          name: found.name,
          emoji: found.emoji,
          systemPrompt: found.systemPrompt,
          opener: found.opener,
        };
      }
    }

    // Look up the user's tier to know their chat-memory limit.
    const { data: profile } = await supabase
      .from("profiles")
      .select("tier")
      .eq("id", userId)
      .single();
    const tier = (profile?.tier as Tier) ?? "free";
    const limit = CHAT_LIMITS[tier];

    // Prune oldest chats so that after we insert the new one we sit at
    // exactly `limit`.
    const { data: existing } = await supabase
      .from("chats")
      .select("id")
      .order("updated_at", { ascending: false });
    if (existing && existing.length >= limit) {
      const toDelete = existing.slice(limit - 1).map((c) => c.id);
      if (toDelete.length > 0) {
        await supabase.from("chats").delete().in("id", toDelete);
      }
    }

    const { data: chat, error } = await supabase
      .from("chats")
      .insert({
        user_id: userId,
        title: dap ? `${dap.name} chat` : "New chat",
        is_incognito: !!data?.incognito,
      })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw dbError(error);

    if (dap) {
      const { error: dapErr } = await supabase.from("chat_messages").insert([
        {
          chat_id: chat.id,
          user_id: userId,
          role: "system",
          content: `[DAP: ${dap.name}]\n${dap.systemPrompt}`,
        },
        {
          chat_id: chat.id,
          user_id: userId,
          role: "assistant",
          content: `${dap.emoji} **${dap.name}** is ready.\n\n${dap.opener}`,
        },
      ]);
      if (dapErr) throw new Error(`Couldn't initialize DAP: ${dapErr.message}`);
    }
    return chat;
  });



export const deleteChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ chatId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("chats").delete().eq("id", data.chatId);
    if (error) throw dbError(error);
    return { ok: true };
  });

export const getChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ chatId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [{ data: chat, error: cErr }, { data: messages, error: mErr }] =
      await Promise.all([
        supabase
          .from("chats")
          .select("id, title, created_at, updated_at")
          .eq("id", data.chatId)
          .single(),
        supabase
          .from("chat_messages")
          .select("id, role, content, model, created_at, memory_used")
          .eq("chat_id", data.chatId)
          .order("created_at", { ascending: true }),
      ]);
    if (cErr) throw dbError(cErr);
    if (mErr) throw dbError(mErr);
    return { chat, messages: messages ?? [] };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, name, tier, pro_messages_used")
      .eq("id", userId)
      .single();
    if (error) throw dbError(error);
    return {
      ...data,
      chatLimit: CHAT_LIMITS[(data.tier as Tier) ?? "free"],
    };
  });


/**
 * Send a chat message:
 *  - Free tier is locked to Lite. Pro tier may choose either model.
 *  - Stores the user message, calls the per-model backend through that
 *    model's queue (one in-flight request per model on the local GPU).
 */
export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        chatId: z.string().uuid(),
        text: z.string().min(1).max(8000),
        model: z.enum(MODEL_IDS),
        images: z
          .array(z.string().startsWith("data:image/").max(8_000_000))
          .max(4)
          .optional(),
        searchQuery: z.string().min(1).max(200).optional(),
        /** Study Mode: Socratic tutoring, one step at a time. */
        studyMode: z.boolean().optional(),
      })
      .parse(i)
  )

  .handler(async ({ context, data }) => {
    const { supabase: userClient, userId } = context;

    // Ownership gate: the chat must belong to the caller before we write
    // anything referencing its id. The chat_messages INSERT policy only
    // pins user_id, so without this a known/guessed chat UUID could be
    // written into by another signed-in user.
    //
    // Admins are allowed to open and reply inside any chat from the admin
    // console; messages are then attributed to the chat's owner so the
    // conversation stays coherent for both sides.
    let supabase = userClient;
    let ownerId = userId;
    {
      const { data: chat, error: ownErr } = await userClient
        .from("chats")
        .select("id, user_id")
        .eq("id", data.chatId)
        .maybeSingle();
      if (ownErr) throw dbError(ownErr);
      if (chat) {
        ownerId = chat.user_id;
      } else {
        const { assertAdmin } = await import("./admin.server");
        await assertAdmin(userId);
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: anyChat, error: anyErr } = await supabaseAdmin
          .from("chats")
          .select("id, user_id")
          .eq("id", data.chatId)
          .maybeSingle();
        if (anyErr) throw dbError(anyErr);
        if (!anyChat) throw new Error("Chat not found.");
        ownerId = anyChat.user_id;
        supabase = supabaseAdmin as unknown as typeof userClient;
      }
    }



    // Block sends when the site is in maintenance mode.
    {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data: status } = await supabaseAdmin
        .from("ai_settings")
        .select("system_prompt")
        .eq("id", "site_status")
        .maybeSingle();
      if ((status?.system_prompt ?? "on").trim().toLowerCase() === "off") {
        throw new Error(
          "DAP AI is undergoing major reworks. Please try again later."
        );
      }
    }

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("tier, pro_messages_used")
      .eq("id", ownerId)
      .single();
    if (pErr) throw dbError(pErr);

    // Tier gate: downgrade to the best model this account may actually use.
    const callerTier = ((profile.tier as Tier | undefined) ?? "free") as Tier;
    const requested = modelInfo(data.model)!;
    let effectiveModel: ModelId = data.model;
    let forcedToLite = false;
    if (TIER_RANK[callerTier] < TIER_RANK[requested.minTier]) {
      effectiveModel =
        TIER_RANK[callerTier] >= TIER_RANK["go"] ? "dap-ai-pro-lite" : "dap-ai-lite";
      forcedToLite = true;
    }
    const active = modelInfo(effectiveModel)!;

    // Enforce per-model feature flags set in the admin console.
    {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data: flag } = await supabaseAdmin
        .from("ai_settings")
        .select("system_prompt")
        .eq("id", `feature_${active.flag}`)
        .maybeSingle();
      if ((flag?.system_prompt ?? "on").trim().toLowerCase() === "off") {
        throw new Error(`${active.label} is currently disabled by the admin.`);
      }
    }



    const imageCount = data.images?.length ?? 0;

    /* Usage tokens. Charged before the model is called, because a reply
       that arrives after the allowance ran out is a reply we gave away.
       The prompt cap is checked first so an over-long message is refused
       outright rather than billed at the top band and then rejected. */
    {
      const limits = TIER_LIMITS[callerTier];
      if (imageCount > MAX_IMAGES_PER_PROMPT) {
        throw new Error(`Please attach at most ${MAX_IMAGES_PER_PROMPT} image per message.`);
      }
      const promptTokens = estimateTokens(data.text);
      if (promptTokens > limits.maxPromptTokens) {
        throw new Error(
          `That message is too long for your plan — about ${promptTokens} tokens against a ${limits.maxPromptTokens} limit. Shorten it, or upgrade for more room.`
        );
      }

      const cost = costOfPrompt({
        tier: callerTier,
        model: effectiveModel,
        promptTokens,
        hasImage: imageCount > 0,
      });

      // charge_usage does the check and the debit under a row lock, so two
      // messages sent at once cannot both spend the last token.
      const { data: charged, error: chargeErr } = await supabase
        .rpc("charge_usage", { _cost: cost, _images: Math.min(imageCount, 1) })
        .maybeSingle();
      if (chargeErr) {
        // No ledger installed yet means no limit configured, not a limit
        // reached. Anything else fails closed.
        if (!isLedgerMissing(chargeErr)) throw dbError(chargeErr, "charge_usage");
        console.warn("[usage] charge_usage missing — not counting this message");
      }
      if (charged && charged.ok === false) {
        throw new Error(charged.reason ?? "You have used up your allowance.");
      }
    }

    const storedUserContent =
      imageCount > 0
        ? `${data.text}\n\n_(📎 ${imageCount} image${imageCount > 1 ? "s" : ""} attached)_`
        : data.text;

    // Record the sender's IP alongside the message (admin console only).
    let senderIp: string | null = null;
    try {
      const { requestIp } = await import("./rate-limit.server");
      senderIp = requestIp();
    } catch {
      /* best-effort */
    }

    const { error: insUserErr } = await supabase.from("chat_messages").insert({
      chat_id: data.chatId,
      user_id: ownerId,
      role: "user",
      content: storedUserContent,
      model: effectiveModel,
      ip: senderIp,
    });
    if (insUserErr) throw dbError(insUserErr);



    const { data: chatRow } = await supabase
      .from("chats")
      .select("title")
      .eq("id", data.chatId)
      .single();
    if (chatRow?.title === "New chat") {
      await supabase
        .from("chats")
        .update({ title: data.text.slice(0, 60) })
        .eq("id", data.chatId);
    } else {
      await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.chatId);
    }

    // Load the secret system prompt server-side via the admin client so
    // it's injected for everyone but never readable by regular users.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perModel } = await supabaseAdmin
      .from("ai_settings")
      .select("system_prompt")
      .eq("id", effectiveModel)
      .maybeSingle();
    let systemPrompt = perModel?.system_prompt?.trim() ?? "";
    if (!systemPrompt) {
      const { data: legacy } = await supabaseAdmin
        .from("ai_settings")
        .select("system_prompt")
        .eq("id", "global")
        .maybeSingle();
      systemPrompt = legacy?.system_prompt?.trim() ?? "";
    }

    // Per-user memories (ChatGPT-style). Injected as a system message.
    const { data: memRows } = await supabase
      .from("user_memories")
      .select("content")
      .eq("enabled", true)
      .order("created_at", { ascending: true });
    const memoryBlock =
      memRows && memRows.length > 0
        ? `What you remember about this user (use naturally, don't recite):\n${memRows
            .map((m) => `- ${m.content}`)
            .join("\n")}`
        : "";

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });

    // Detect an active DAP from the chat's first system message (set by
    // createChat when dapId was passed). Lets the meta-prompt know what
    // persona is in play.
    const firstSystem = (history ?? []).find((m) => m.role === "system");
    const dapMatch = firstSystem?.content.match(/^\[DAP:\s*([^\]\n]+)\]/);
    const dapName = dapMatch?.[1]?.trim();

    // Meta-prompt layer: a fast Lovable AI model drafts a per-message
    // system addendum on top of the admin base + DAP prompt.
    const metaPrompt =
      active.lite ? "" : await generateMetaPrompt(data.text, systemPrompt, dapName);

    // Auto web-search: a fast classifier decides if the question needs
    // fresh info; if so we run a Firecrawl search and inject the results
    // as system context so the model can answer accurately and cite.
    let webContext = "";
    try {
      const query =
        data.searchQuery && data.searchQuery.trim().length > 0
          ? data.searchQuery.trim()
          : await planWebSearch(data.text);
      if (query) webContext = await webSearchContext(query);
    } catch {
      /* best-effort */
    }

    const ANTI_SYCOPHANCY =
      "Accuracy rules: (1) NEVER invent specific numbers, stats, dates, names, prices, or version numbers. If you don't actually know the exact value, say \"I'm not sure\" or \"I don't have that info\" — do not guess and do not output a plausible-looking number. (2) For niche topics (specific games, mods, private projects, internal tools, fan communities) assume the user knows more than you. If the user states a value, trust it and use it going forward unless web search results clearly contradict it. (3) If web search results are present above, prefer them over both your training data and the user's claim, and cite [1], [2] when relevant.";

    const messages: Array<{ role: "user" | "assistant" | "system"; content: unknown }> = [
      ...(active.lite
        ? [
            {
              role: "system" as const,
              content: LITE_NO_THINK_PROMPT,
            },
          ]
        : []),
      ...(systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }]
        : []),
      ...(memoryBlock
        ? [{ role: "system" as const, content: memoryBlock }]
        : []),
      ...(metaPrompt
        ? [
            {
              role: "system" as const,
              content: `[Auto-tuned prompt for this request]\n${metaPrompt}`,
            },
          ]
        : []),
      ...(webContext
        ? [{ role: "system" as const, content: webContext }]
        : []),
      { role: "system" as const, content: ANTI_SYCOPHANCY },
      ...(data.studyMode ? [{ role: "system" as const, content: STUDY_MODE_PROMPT }] : []),


      // Keep the system message at the head (for DAP context) and trim
      // the rolling history for Lite so it fits in its smaller LM Studio
      // context window.
      ...(() => {
        const all = history ?? [];
        if (!active.lite) return all;
        const sys = all.filter((m) => m.role === "system");
        const rest = all.filter((m) => m.role !== "system");
        return [...sys, ...rest.slice(-LITE_HISTORY_LIMIT)];
      })().map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content:
          active.lite && m.role === "assistant"
            ? sanitizeLiteReply(m.content)
            : (m.content as unknown),
      })),

    ];


    // If images were attached, upgrade the LAST user message to OpenAI
    // vision "content array" format so multimodal backends can see them.
    // Lite (Gemma E2B) is text-only — drop images to avoid hanging the
    // backend with a payload it can't process.
    const visionImages =
      active.lite ? [] : (data.images ?? []);
    if (visionImages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          messages[i] = {
            role: "user",
            content: [
              { type: "text", text: data.text },
              ...visionImages.map((url) => ({
                type: "image_url",
                image_url: { url },
              })),
            ],
          };
          break;
        }
      }
    }


    const { url: backend, key, upstreamModel } = backendFor(effectiveModel);
    const { offlineMessage } = await import("./offline-message.server");

    let replyText = "";
    if (!backend) {
      console.error(
        `[chat] No AI backend configured for ${effectiveModel} (missing AI_BACKEND_URL_${active.lite ? "LITE" : "PRO"}).`
      );
      replyText = await offlineMessage();

    } else {
      // Per-model queue: only one in-flight call per model at a time.
      replyText = await enqueue(`model:${effectiveModel}`, async () => {
        const liteOptions = {
          reasoning_effort: "none",
          thinking: false,
          enable_thinking: false,
          include_reasoning: false,
          return_reasoning: false,
          temperature: 0,
          top_p: 1,
          chat_template_kwargs: {
            enable_thinking: false,
            thinking: false,
            no_think: true,
          },
          extra_body: {
            chat_template_kwargs: {
              enable_thinking: false,
              thinking: false,
              no_think: true,
            },
          },
        };

        // The user may have hit Stop while this request waited in line.
        if (isStopped(data.chatId)) return "__DAP_STOPPED__";

        const ctrl = new AbortController();
        registerAborter(data.chatId, ctrl);
        const timeoutMs = 90_000;
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          let resolvedModel = upstreamModel;
          if (active.lite) {
            const resolved = await resolveOllamaModel(backend, key, upstreamModel);
            if (resolved.installed && resolved.installed.length === 0) {
              console.error(
                `[chat] ${active.label} backend has no models installed.`
              );
              return await offlineMessage();
            }

            resolvedModel = resolved.model;
          }
          const res = await fetch(backend, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
            },
            body: JSON.stringify({
              model: resolvedModel,
              messages,
              stream: false,
              ...(active.lite ? liteOptions : {}),
            }),
            signal: ctrl.signal,
          });
          const raw = await res.text();
          let json: {
            choices?: { message?: { content?: string } }[];
            message?: { content?: string };
            error?: string | { message?: string };
          } = {};
          try {
            json = JSON.parse(raw);
          } catch {
            // Upstream returned non-JSON (ngrok error page, HTML, plain text).
            console.error(
              `[chat] Non-JSON from backend (HTTP ${res.status}): ${raw.replace(/\s+/g, " ").trim().slice(0, 200)}`
            );
            return await offlineMessage();
          }
          const errStr =
            typeof json?.error === "string"
              ? json.error
              : json?.error?.message;
          const content =
            json?.choices?.[0]?.message?.content ?? json?.message?.content;
          if (!content) {
            console.error(
              `[chat] Backend returned no content (HTTP ${res.status}): ${errStr ?? raw.slice(0, 200)}`
            );
            return await offlineMessage();
          }
          // Always strip <think>/reasoning blocks and system-prompt
          // echoes — Pro can leak them too depending on which checkpoint
          // is loaded in LM Studio.
          let out = sanitizeLiteReply(content);
          if (hasLiteReasoningLeak(out)) out = sanitizeLiteReply(out);
          return out;
        } catch (e) {
          const err = e as Error;
          if (err.name === "AbortError" && isStopped(data.chatId)) {
            return "__DAP_STOPPED__";
          }
          console.error(`[chat] Backend request failed: ${err.name}: ${err.message}`);
          if (err.name === "AbortError") {
            return "DAP AI took too long to reply. Please try again.";
          }
          return await offlineMessage();

        } finally {
          clearTimeout(timer);
          unregisterAborter(data.chatId);
        }
      });
    }

    if (replyText === "__DAP_STOPPED__") {
      clearStopped(data.chatId);
      const { data: stoppedMsgs } = await supabase
        .from("chat_messages")
        .select("id, role, content, model, created_at, memory_used")
        .eq("chat_id", data.chatId)
        .order("created_at", { ascending: true });
      return {
        messages: stoppedMsgs ?? [],
        forcedToLite,
        effectiveModel,
        stopped: true,
      };
    }

    // Insert assistant message
    await supabase.from("chat_messages").insert({
      chat_id: data.chatId,
      user_id: ownerId,
      role: "assistant",
      content: replyText,
      model: effectiveModel,
      memory_used: memoryBlock.length > 0,
    });

    // Auto-extract durable memories from the user's message (best-effort).
    try {
      const existingMems = (memRows ?? []).map((m) => m.content);
      const newMems = await extractMemories(data.text, existingMems);
      if (newMems.length > 0) {
        await supabase.from("user_memories").insert(
          newMems.map((content) => ({ user_id: ownerId, content }))
        );
      }
    } catch {
      /* best-effort, ignore */
    }

    // Return refreshed view
    const { data: messagesOut } = await supabase
      .from("chat_messages")
      .select("id, role, content, model, created_at, memory_used")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });

    clearStopped(data.chatId);

    return {
      messages: messagesOut ?? [],
      forcedToLite,
      effectiveModel,
      stopped: false,
    };
  });

/**
 * Interrupt the in-flight (or queued) reply for a chat so the next person in
 * the per-model queue can go ahead.
 */
export const stopChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ chatId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: owned, error } = await supabase
      .from("chats")
      .select("id")
      .eq("id", data.chatId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!owned) throw new Error("Chat not found.");
    markStopped(data.chatId);
    return { ok: true };
  });

