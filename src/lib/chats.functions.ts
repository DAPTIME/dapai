import { dbError } from "./db-error";
import {
  CHAT_HISTORY_LIMIT as CHAT_LIMITS,
  TIER_LIMITS,
  MAX_IMAGES_PER_RESPONSE,
  PROMPT_TOO_LONG_MESSAGE,
  costOfPrompt,
  estimateTokens,
  isLedgerMissing,
  limitRefusal,
  type ChargeResult,
} from "@/lib/usage-limits";
/**
 * Server functions for chats. All run as the authenticated user so RLS
 * scopes every read/write to that user's rows.
 *
 * All inference goes through the single DAP orchestrator
 * (src/lib/dap-orchestrator.server.ts) — there are no per-model backend
 * URLs anymore. `effectiveModel` only selects the system prompt / feature
 * flag / vision handling; the orchestrator itself picks the tier's hardware.
 *
 * Saved-chat limits per plan live in usage-limits.ts (5 / 15 / 50 /
 * unlimited). The oldest are pruned when a new chat is created.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  enqueue,
  isStopped,
  clearStopped,
  markStopped,
  registerAborter,
  unregisterAborter,
} from "@/lib/ai-queue";
import { hasLiteReasoningLeak, sanitizeLiteReply } from "@/lib/lite-sanitize";
import { isSafetyBlock, SAFETY_BLOCKED_MESSAGE } from "@/lib/safety";
import {
  MODEL_IDS,
  modelInfo,
  effectiveModelFor,
  orchestratorModelName,
  type ModelId,
} from "@/lib/models";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
import { parseSiteStatus, siteOpenTo } from "@/lib/site-status";



// History depth is decided by the orchestrator from the account tier
// (free 3 / go 5 / pro 8 / exclusive 10). Nothing here trims it.


/* Same idea for memory extraction: a named throw so the best-effort catch
   below stays honest about what it is swallowing. */
class SkipMemory extends Error {}

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

export const listChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    /* Retired chats are filtered out here as well as by RLS. Before the
       soft-delete migration runs the column does not exist and PostgREST
       rejects the filter, so fall back to the unfiltered query — at that
       point nothing is flagged anyway, and a chat list that errors is far
       worse than one that briefly cannot hide something that does not
       exist yet. */
    let { data, error } = await supabase
      .from("chats")
      .select("id, title, created_at, updated_at, pinned")
      .eq("is_incognito", false)
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error && isLedgerMissing(error)) {
      ({ data, error } = await supabase
        .from("chats")
        .select("id, title, created_at, updated_at, pinned")
        .eq("is_incognito", false)
        .order("updated_at", { ascending: false }));
    }
    if (error) throw dbError(error);
    return data;
  });

/**
 * Pin or unpin a chat. Pinned chats are exempt from prune_own_chats but
 * still occupy one of the plan's saved-chat slots — see the migration for
 * the exact rule. Just an update under RLS; no new grant needed since the
 * owner can already update their own rows.
 */
export const setChatPinned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ chatId: z.string().uuid(), pinned: z.boolean() }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("chats")
      .update({ pinned: data.pinned })
      .eq("id", data.chatId)
      .eq("user_id", userId);
    if (error) throw dbError(error);
    return { ok: true };
  });

/**
 * Drop a chat that never got an answer.
 *
 * A thread with a question and no reply is not a conversation, and leaving
 * it in the list burns one of the account's saved-chat slots on nothing. So
 * navigating away from one discards it.
 *
 * Two things are deliberately kept instead:
 *
 *   - a reply still being generated. Someone opening a chat, sending, and
 *     switching tabs while it thinks must come back to it, so a live queue
 *     ticket for this chat vetoes the delete. Checked here rather than
 *     trusted from the browser, because the browser that navigated away is
 *     the one least able to know.
 *
 *   - a reply that was cancelled. Pressing stop is a decision about the
 *     answer, not about the chat, and throwing away what they typed would
 *     punish them for it. The caller says so with `cancelled`.
 *
 * Returns what it did, so the caller can tell "gone" from "kept" rather
 * than guessing.
 */
export const discardEmptyChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        chatId: z.string().uuid(),
        cancelled: z.boolean().optional().default(false),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.cancelled) return { deleted: false, reason: "cancelled" as const };

    const { data: chat } = await supabase
      .from("chats")
      .select("id")
      .eq("id", data.chatId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!chat) return { deleted: false, reason: "missing" as const };

    // Any assistant turn at all means this is a real conversation.
    const { count: replies } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", data.chatId)
      .eq("role", "assistant");
    if ((replies ?? 0) > 0) return { deleted: false, reason: "has-reply" as const };

    const { tryAdminClient } = await import("./admin-client.server");
    const adminForDiscard = await tryAdminClient();

    // Still queued or generating somewhere. Only the admin client can see
    // the queue; without one, skip the check — the soft-delete fallback
    // below cannot lose a reply, it only hides the chat from the sidebar.
    if (adminForDiscard) {
      const { count: live } = await adminForDiscard
        .from("ai_queue")
        .select("id", { count: "exact", head: true })
        .eq("chat_id", data.chatId)
        .in("state", ["waiting", "running"]);
      if ((live ?? 0) > 0) return { deleted: false, reason: "in-flight" as const };
    }

    if (!adminForDiscard) {
      // No key, no hard delete (DELETE on chats is revoked from users). The
      // soft delete gives the same experience — the empty chat vanishes —
      // and leaves an empty row for the console instead of an error here.
      const { error: softErr } = await supabase.rpc("delete_own_chat", {
        _id: data.chatId,
      });
      if (softErr && !isLedgerMissing(softErr)) throw dbError(softErr, "discardEmptyChat");
      return { deleted: true, reason: "empty" as const };
    }

    /* Through the service-role client, because the soft-delete change
       revoked DELETE on chats from authenticated — this ran as the user and
       started failing with a permission error the moment that landed.

       A real delete rather than the soft one is right here: retention keeps
       chats a person chose to delete so an admin can still read them, and
       an empty chat has nothing in it to read. Ownership was checked at the
       top of this handler, so the service role is only being used to get
       past the grant, not past a check. */
    const { error } = await adminForDiscard
      .from("chats")
      .delete()
      .eq("id", data.chatId)
      .eq("user_id", userId);
    if (error) throw dbError(error, "discardEmptyChat");
    return { deleted: true, reason: "empty" as const };
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
    /* Retire anything past the plan's limit, leaving room for the one about
       to be created. Falling off the end of the history is still a deletion,
       so these are flagged rather than removed and the console keeps them. */
    if (Number.isFinite(limit)) {
      const { error: pruneErr } = await supabase.rpc("prune_own_chats", {
        _keep: Math.max(0, limit - 1),
      });
      // Same fallback as deletion: keep the cap working before the
      // migration lands, rather than letting histories grow unbounded.
      if (pruneErr && isLedgerMissing(pruneErr)) {
        const { data: existing } = await supabase
          .from("chats")
          .select("id")
          .order("updated_at", { ascending: false });
        const stale = (existing ?? []).slice(limit - 1).map((c) => c.id);
        if (stale.length) await supabase.from("chats").delete().in("id", stale);
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
    const { supabase, userId } = context;
    /* Soft delete: the chat leaves this user's history for good, and the
       row stays for the admin console. Users no longer hold DELETE on the
       table, so this is the only route once the migration has run.
       Before it has, fall back to the old hard delete — a deploy that
       reaches production ahead of its migration should still let people
       delete their own chats, rather than failing in their face. */
    let { error } = await supabase.rpc("delete_own_chat", { _id: data.chatId });
    if (error && isLedgerMissing(error)) {
      ({ error } = await supabase
        .from("chats")
        .delete()
        .eq("id", data.chatId)
        .eq("user_id", userId));
    }
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
        await assertAdmin(userId, userClient);
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



    // Block sends when the site is in maintenance mode. Read through the
    // admin client when there is one; without it, fail open the same way
    // getPublicSiteConfig does — a missing settings lookup must degrade to
    // "the site is up", never take chat down with it.
    {
      const { tryAdminClient } = await import("./admin-client.server");
      const adminClient = await tryAdminClient();
      const { data: status } = adminClient
        ? await adminClient
            .from("ai_settings")
            .select("system_prompt")
            .eq("id", "site_status")
            .maybeSingle()
        : { data: null };
      const siteStatus = parseSiteStatus(status?.system_prompt);
      if (siteStatus !== "on") {
        // "admin" keeps the site usable for site admins while it is closed
        // to everyone else, so a change can be tested without opening it up.
        const { isAdminUser } = await import("./admin.server");
        const viewerIsAdmin =
          siteStatus === "admin" ? await isAdminUser(userId, supabase).catch(() => false) : false;
        if (!siteOpenTo(siteStatus, viewerIsAdmin)) {
          throw new Error(
            "DAP AI is undergoing major reworks. Please try again later."
          );
        }
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
    const effectiveModel: ModelId = effectiveModelFor(callerTier, data.model);
    const forcedToLite = effectiveModel !== data.model;
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

    /* What this message actually cost, kept in scope so an outage can give
       it back. Stays at zero for Exclusive and for anyone whose ledger is
       not installed, and refunding zero is a no-op — so the refund path
       needs no special case for either. */
    let chargedCost = 0;
    let chargedImages = 0;

    /* Usage tokens. Charged before the model is called, because a reply
       that arrives after the allowance ran out is a reply we gave away.
       The prompt cap is checked first so an over-long message is refused
       outright rather than billed at the top band and then rejected. */
    {
      const limits = TIER_LIMITS[callerTier];

      if (imageCount > MAX_IMAGES_PER_RESPONSE) {
        throw new Error(
          `Only ${MAX_IMAGES_PER_RESPONSE} image per message, on every plan.`
        );
      }
      // A plan with no image allowance is an upgrade prompt, not a quota
      // message — there is no reset that will give them one.
      if (imageCount > 0 && limits.imagesPerDay <= 0) {
        throw new Error(
          "Images aren't part of your plan. Upgrade to generate them."
        );
      }

      /* The length check comes first and costs nothing: an over-long
         message is refused outright rather than billed at the top band
         and then rejected. costOfPrompt returns null for exactly that
         case, so the two cannot drift apart. */
      const promptTokens = estimateTokens(data.text);
      const cost = costOfPrompt(callerTier, promptTokens);
      if (cost === null) throw new Error(PROMPT_TOO_LONG_MESSAGE);

      /* Exclusive is never checked and never deducted from — not even a
         zero-cost call, which would still tick the image counter. Everyone
         else goes through charge_usage, which does the check and the debit
         under a row lock, so two messages sent at once cannot both spend
         the last token. */
      if (callerTier === "exclusive") {
        chargedCost = 0;
        chargedImages = 0;
      } else {
        chargedCost = cost;
        chargedImages = Math.min(imageCount, 1);

        const { data: charged, error: chargeErr } = await supabase
          .rpc("charge_usage", { _cost: cost, _images: chargedImages })
          .maybeSingle();
        if (chargeErr) {
          // No ledger installed yet means no limit configured, not a limit
          // reached. Anything else fails closed.
          if (!isLedgerMissing(chargeErr)) throw dbError(chargeErr, "charge_usage");
          console.warn("[usage] charge_usage missing — not counting this message");
        }
        if (charged && charged.ok === false) {
          throw new Error(limitRefusal(charged as ChargeResult, callerTier));
        }
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
      .select("title, is_incognito")
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

    const anonymous = !!chatRow?.is_incognito;

    /* Per-user memories (ChatGPT-style). Injected as a system message.
       Gated here and not only in the UI: hiding the toggle stops the
       button being pressed, it does not stop the request being sent.

       Skipped entirely in an incognito chat. The toggle promises the
       assistant does not know you, and reading back a stored fact about
       someone in the middle of the reply is exactly the thing it promises
       will not happen. */
    const { data: memRows } = TIER_LIMITS[callerTier].memory && !anonymous
      ? await supabase
          .from("user_memories")
          .select("content")
          .eq("enabled", true)
          .order("created_at", { ascending: true })
      : { data: null };
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
      /* Not in incognito. The meta-prompt step sends the message text to an
         external model to draft a prompt addendum, and a chat the person
         marked incognito should not leave this platform at all — memory
         extraction is already skipped for the same reason. The result is
         best-effort everywhere else (it returns "" on any failure), so
         omitting it degrades nothing but the prompt tuning. */
      active.lite || anonymous
        ? ""
        : await generateMetaPrompt(data.text, systemPrompt, dapName);

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
      { role: "system" as const, content: ANTI_SYCOPHANCY },
      ...(data.studyMode ? [{ role: "system" as const, content: STUDY_MODE_PROMPT }] : []),


      /* The full conversation, untrimmed. History depth is the
         orchestrator's job: it derives the effective tier from
         min(account tier, model) and applies its own context window,
         history depth (free 3 / go 5 / pro 8 / exclusive 10) and output
         cap. Trimming here would silently override that. */
      ...(history ?? []).map((m) => ({
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


    const { offlineMessage } = await import("./offline-message.server");
    const {
      aiEnabled,
      orchestratorComplete,
      OrchestratorUnavailableError,
      AI_MAINTENANCE_MESSAGE,
      CONNECTION_LOST_MESSAGE,
    } = await import("./dap-orchestrator.server");

    /* Set wherever the reply is an outage rather than an answer, so the
       charge can be given back. A flag rather than matching the text of
       offlineMessage(), which is admin-configurable — the day someone
       reworded it, string matching would stop refunding and nobody would
       notice. */
    let dispatchFailed = false;

    let replyText = "";
    if (!(await aiEnabled())) {
      dispatchFailed = true;
      replyText = AI_MAINTENANCE_MESSAGE;
    } else {
      // One in-flight generation per tier lane: inference runs on one box.
      replyText = await enqueue(`model:${effectiveModel}`, async () => {
        // The user may have hit Stop while this request waited in line.
        if (isStopped(data.chatId)) return "__DAP_STOPPED__";

        const ctrl = new AbortController();
        registerAborter(data.chatId, ctrl);
        try {
          const out = await orchestratorComplete({
            tier: callerTier,
            model: orchestratorModelName(effectiveModel),
            messages: messages as Array<{
              role: "system" | "user" | "assistant";
              content: unknown;
            }>,
            timeoutMs: 180_000,
            signal: ctrl.signal,
          });
          if (!out.trim()) {
            dispatchFailed = true;
            return await offlineMessage();
          }
          let cleaned = sanitizeLiteReply(out);
          if (hasLiteReasoningLeak(cleaned)) cleaned = sanitizeLiteReply(cleaned);
          return cleaned;
        } catch (e) {
          const err = e as Error;
          if (err.name === "AbortError" && isStopped(data.chatId)) {
            return "__DAP_STOPPED__";
          }
          dispatchFailed = true;
          if (err.name === "AbortError") {
            return "DAP AI took too long to reply. Please try again.";
          }
          if (err instanceof OrchestratorUnavailableError) {
            return err.message === CONNECTION_LOST_MESSAGE
              ? CONNECTION_LOST_MESSAGE
              : await offlineMessage();
          }
          console.error(`[chat] orchestrator failed: ${err.name}: ${err.message}`);
          return await offlineMessage();
        } finally {
          unregisterAborter(data.chatId);
        }
      });
    }


    /* Nothing was generated, so give the tokens back. Best effort and
       deliberately non-fatal: a refund that fails must not turn an outage
       into a second error on top of it. Safety refusals and stopped
       replies are not refunded — both were served. */
    if (dispatchFailed && chargedCost > 0) {
      const { tryAdminClient } = await import("./admin-client.server");
      const refundClient = await tryAdminClient();
      if (refundClient) {
        const { error: refundErr } = await refundClient.rpc("admin_refund_usage", {
          _user_id: userId,
          _cost: chargedCost,
          _images: chargedImages,
        });
        if (refundErr && !isLedgerMissing(refundErr)) {
          console.error(`[usage] refund failed: ${refundErr.message}`);
        }
      } else {
        // Refunds are best-effort by design; without the key they are
        // skipped, not fatal. The reply flow below continues unchanged.
        console.warn("[usage] no admin client; refund skipped");
      }
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

    /* Auto-extract durable memories from the user's message (best-effort).
       Not in an incognito chat, and not on a plan without memory: a chat
       that does not read memory must not quietly write it either, or
       "doesn't know anything about me" lasts exactly until the next
       conversation. */
    try {
      if (anonymous || !TIER_LIMITS[callerTier].memory) throw new SkipMemory();
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
 * Interrupt the in-flight (or queued) reply for a chat.
 *
 * Only one request runs across the whole system at a time, so an abandoned
 * slot stalls every other user: the slot is released here immediately rather
 * than waiting for the reaper. The usage charge is given back too, and the
 * partial reply (if the client streamed any) is saved marked as stopped so
 * reloading the thread shows what actually arrived.
 */
export const stopChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        chatId: z.string().uuid(),
        partialText: z.string().max(200_000).optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: owned, error } = await supabase
      .from("chats")
      .select("id")
      .eq("id", data.chatId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!owned) throw new Error("Chat not found.");

    markStopped(data.chatId);

    // Free the single system-wide generation slot right away.
    await Promise.resolve(
      supabase.rpc("queue_release", { _id: data.chatId, _cancelled: true })
    ).catch(() => {});

    /* No refund here, for two reasons. The amount arrived from the browser
       as refundCost, so it was the caller's to choose — the hole this
       closes. And a stopped reply is a served reply: tokens were produced
       and shown, and stopping is a decision about the rest of them, which
       is what refund_usage has always documented. The client never sent
       the field anyway. */

    const partial = (data.partialText ?? "").trim();
    if (partial) {
      await Promise.resolve(
        supabase.from("chat_messages").insert({
          chat_id: data.chatId,
          user_id: userId,
          role: "assistant",
          content: `${partial}\n\n_Stopped._`,
        })
      ).catch(() => {});
    }

    return { ok: true };
  });

/**
 * Persist a partial assistant reply the client streamed before the stream
 * ended abnormally. Marked as stopped so the thread reads honestly on reload.
 */
export const saveStoppedReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        chatId: z.string().uuid(),
        text: z.string().min(1).max(200_000),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: owned, error } = await supabase
      .from("chats")
      .select("id")
      .eq("id", data.chatId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!owned) throw new Error("Chat not found.");
    await Promise.resolve(
      supabase.from("chat_messages").insert({
        chat_id: data.chatId,
        user_id: userId,
        role: "assistant",
        content: `${data.text.trim()}\n\n_Stopped._`,
      })
    ).catch(() => {});
    return { ok: true };
  });


