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
import { enqueue } from "@/lib/ai-queue";

const CHAT_LIMITS = { free: 5, pro: 10 } as const;

// Lite gets a smaller rolling window so its (smaller LM Studio context)
// never overflows. Pro keeps the full history.
const LITE_HISTORY_LIMIT = 12;


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

function backendFor(model: "dap-ai-1.0" | "dap-ai-lite"): {
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
  return {
    url: process.env.AI_BACKEND_URL_LITE ?? process.env.AI_BACKEND_URL,
    key: process.env.AI_BACKEND_KEY_LITE ?? process.env.AI_BACKEND_KEY,
    upstreamModel: process.env.AI_BACKEND_MODEL_LITE ?? model,
  };
}

function sanitizeLiteReply(text: string): string {
  const original = text;
  let out = text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, "")
    .replace(/\|begin_of_thought\|[\s\S]*?\|end_of_thought\|/gi, "")
    .replace(/<\|begin_of_reasoning\|>[\s\S]*?<\|end_of_reasoning\|>/gi, "")
    .replace(/^\s*(?:thinking|thought|reasoning|analysis|scratchpad)\s*:[\s\S]*?\n\s*(?:final(?: answer)?|answer|response)\s*:\s*/i, "")
    .replace(/^\s*(?:final(?: answer)?|answer|response)\s*:\s*/i, "");

  if (/^\s*(?:the user\b|i\s+(?:need|should|will|must|have|can|want|am going|would)\b|i['’]ll\b|(?:as per|per|according to|based on|following)\b)/i.test(out)) {
    const directStart = out.search(/\b(?:hey|hi|hello|sure|absolutely|yes|no|thanks|you(?:'|’)re welcome|here(?:'|’)s|here is|got it|okay|of course)\b/i);
    if (directStart > 0) out = out.slice(directStart);
  }

  const metaSentenceRe =
    /^\s*(?:the user\b[\s\S]{0,320}?[.!?]["'’)\]]?|i\s+(?:need|should|will|must|have|can|want|am going|would)\b[\s\S]{0,320}?[.!?]["'’)\]]?|i['’]ll\b[\s\S]{0,320}?[.!?]["'’)\]]?|(?:as per|per|according to|based on|following)\b[\s\S]{0,320}?[.!?]["'’)\]]?|(?:my|the)\s+(?:response|reply|answer)\b[\s\S]{0,320}?[.!?]["'’)\]]?)\s*/i;
  let guard = 0;
  while (metaSentenceRe.test(out) && guard++ < 12) {
    out = out.replace(metaSentenceRe, "").replace(/^\s*["'’)\]].?\s*/, "");
  }

  return out.trim() || original.trim();
}

export const listChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("chats")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const createChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ dapId: z.string().min(1).max(128).optional() })
      .optional()
      .parse(i ?? {})
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

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
    const tier = (profile?.tier as "free" | "pro") ?? "free";
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
      })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);

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
    if (error) throw new Error(error.message);
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
          .select("id, role, content, model, created_at")
          .eq("chat_id", data.chatId)
          .order("created_at", { ascending: true }),
      ]);
    if (cErr) throw new Error(cErr.message);
    if (mErr) throw new Error(mErr.message);
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
    if (error) throw new Error(error.message);
    return {
      ...data,
      chatLimit: CHAT_LIMITS[(data.tier as "free" | "pro") ?? "free"],
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
        model: z.enum(["dap-ai-1.0", "dap-ai-lite"]),
        images: z
          .array(z.string().startsWith("data:image/").max(8_000_000))
          .max(4)
          .optional(),
      })
      .parse(i)
  )

  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("tier, pro_messages_used")
      .eq("id", userId)
      .single();
    if (pErr) throw new Error(pErr.message);

    let effectiveModel = data.model;
    let forcedToLite = false;
    if (data.model === "dap-ai-1.0" && profile.tier !== "pro") {
      effectiveModel = "dap-ai-lite";
      forcedToLite = true;
    }


    const imageCount = data.images?.length ?? 0;
    const storedUserContent =
      imageCount > 0
        ? `${data.text}\n\n_(📎 ${imageCount} image${imageCount > 1 ? "s" : ""} attached)_`
        : data.text;

    const { error: insUserErr } = await supabase.from("chat_messages").insert({
      chat_id: data.chatId,
      user_id: userId,
      role: "user",
      content: storedUserContent,
      model: effectiveModel,
    });
    if (insUserErr) throw new Error(insUserErr.message);


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
    const metaPrompt = await generateMetaPrompt(data.text, systemPrompt, dapName);

    const messages: Array<{ role: "user" | "assistant" | "system"; content: unknown }> = [
      ...(effectiveModel === "dap-ai-lite"
        ? [
            {
              role: "system" as const,
              content:
                "CRITICAL: Output ONLY your final reply to the user. Do NOT think out loud. Do NOT narrate what you're about to do. Do NOT reference 'the user', 'instructions', 'persona', or your own reasoning process. Do NOT produce any <think> tags, scratchpad, planning, or meta-commentary. Never start with phrases like 'The user said...', 'I need to...', 'I should...', 'I'll respond...'. Just write the answer directly, as if speaking to the user.",
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
      // Keep the system message at the head (for DAP context) and trim
      // the rolling history for Lite so it fits in its smaller LM Studio
      // context window.
      ...(() => {
        const all = history ?? [];
        if (effectiveModel !== "dap-ai-lite") return all;
        const sys = all.filter((m) => m.role === "system");
        const rest = all.filter((m) => m.role !== "system");
        return [...sys, ...rest.slice(-LITE_HISTORY_LIMIT)];
      })().map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content as unknown,
      })),

    ];


    // If images were attached, upgrade the LAST user message to OpenAI
    // vision "content array" format so multimodal backends can see them.
    if (imageCount > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          messages[i] = {
            role: "user",
            content: [
              { type: "text", text: data.text },
              ...(data.images ?? []).map((url) => ({
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

    let replyText = "";
    if (!backend) {
      replyText = `No AI backend configured for ${effectiveModel}. Set ${
        effectiveModel === "dap-ai-1.0"
          ? "AI_BACKEND_URL_PRO"
          : "AI_BACKEND_URL_LITE"
      } to that model's tunnel URL (e.g. https://abcd.ngrok-free.app/v1/chat/completions).`;
    } else {
      // Per-model queue: only one in-flight call per model at a time.
      replyText = await enqueue(`model:${effectiveModel}`, async () => {
        try {
          const res = await fetch(backend, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
            },
            body: JSON.stringify({
              model: upstreamModel,
              messages,
              stream: false,
              // Disable model "thinking"/reasoning for the Lite model so
              // replies are fast and don't include <think> tokens.
              ...(effectiveModel === "dap-ai-lite"
                ? {
                    reasoning_effort: "none",
                    chat_template_kwargs: { enable_thinking: false },
                  }
                : {}),
            }),
          });
          const json = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
            message?: { content?: string };
            error?: string | { message?: string };
          };
          const errStr =
            typeof json?.error === "string"
              ? json.error
              : json?.error?.message;
          let out =
            json?.choices?.[0]?.message?.content ??
            json?.message?.content ??
            errStr ??
            "(empty response)";
          if (effectiveModel === "dap-ai-lite") {
            // Strip reasoning/thinking blocks the model emits even
            // when we asked it not to think.
            out = out
              .replace(/<think>[\s\S]*?<\/think>/gi, "")
              .replace(/<think>[\s\S]*$/gi, "")
              .replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, "")
              .replace(/^\s*(?:thinking|thought|reasoning)\s*:[\s\S]*?\n\n/i, "");
            // Some models still leak first-person planning prose with no
            // tags ("The user said X. I need to respond..."). Strip leading
            // meta-sentences until the actual reply begins.
            const metaRe =
              /^\s*(?:The user\b[^.!?\n]*[.!?]|I(?:'ll| will| must| need to| should(?:n't)?| have to| can(?:not|'t)?)\b[^.!?\n]*[.!?]|(?:As per|Per|According to|Based on|Following)\s+(?:the|my|these)\s+(?:persona|instructions?|system|prompt|rules|guidelines)\b[^.!?\n]*[.!?]|My (?:response|reply|answer)\b[^.!?\n]*[.!?])\s*/i;
            let guard = 0;
            while (metaRe.test(out) && guard++ < 10) {
              out = out.replace(metaRe, "");
            }
            out = out.trim();
          }
          return out;
        } catch (e) {
          return `Couldn't reach AI backend: ${(e as Error).message}`;
        }
      });
    }

    // Insert assistant message
    await supabase.from("chat_messages").insert({
      chat_id: data.chatId,
      user_id: userId,
      role: "assistant",
      content: replyText,
      model: effectiveModel,
    });

    // Auto-extract durable memories from the user's message (best-effort).
    try {
      const existingMems = (memRows ?? []).map((m) => m.content);
      const newMems = await extractMemories(data.text, existingMems);
      if (newMems.length > 0) {
        await supabase.from("user_memories").insert(
          newMems.map((content) => ({ user_id: userId, content }))
        );
      }
    } catch {
      /* best-effort, ignore */
    }

    // Return refreshed view
    const { data: messagesOut } = await supabase
      .from("chat_messages")
      .select("id, role, content, model, created_at")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });

    return {
      messages: messagesOut ?? [],
      forcedToLite,
      effectiveModel,
    };
  });

