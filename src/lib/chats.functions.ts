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

const FREE_PRO_LIMIT = 5;
const CHAT_LIMITS = { free: 5, pro: 10 } as const;

function backendFor(model: "dap-ai-1.0" | "dap-ai-lite"): {
  url?: string;
  key?: string;
} {
  if (model === "dap-ai-1.0") {
    return {
      url: process.env.AI_BACKEND_URL_PRO ?? process.env.AI_BACKEND_URL,
      key: process.env.AI_BACKEND_KEY_PRO ?? process.env.AI_BACKEND_KEY,
    };
  }
  return {
    url: process.env.AI_BACKEND_URL_LITE ?? process.env.AI_BACKEND_URL,
    key: process.env.AI_BACKEND_KEY_LITE ?? process.env.AI_BACKEND_KEY,
  };
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
      .object({ gemId: z.string().min(1).max(64).optional() })
      .optional()
      .parse(i ?? {})
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { GEMS } = await import("@/lib/gems");
    const gem = data?.gemId ? GEMS.find((g) => g.id === data.gemId) : undefined;

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
        title: gem ? `${gem.name} chat` : "New chat",
      })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);

    if (gem) {
      await supabase.from("chat_messages").insert({
        chat_id: chat.id,
        user_id: userId,
        role: "system",
        content: `[Gem: ${gem.name}]\n${gem.systemPrompt}`,
      });
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
    const remainingPro =
      data.tier === "pro"
        ? null
        : Math.max(0, FREE_PRO_LIMIT - data.pro_messages_used);
    return {
      ...data,
      remainingPro,
      freeProLimit: FREE_PRO_LIMIT,
      chatLimit: CHAT_LIMITS[(data.tier as "free" | "pro") ?? "free"],
    };
  });

/**
 * Send a chat message:
 *  - enforces tier limits (free tier gets FREE_PRO_LIMIT Pro msgs)
 *  - stores the user message, calls the per-model backend through that
 *    model's queue (so only one request at a time hits the local GPU
 *    per model), stores the assistant reply
 *  - returns the updated message list + remainingPro
 */
export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        chatId: z.string().uuid(),
        text: z.string().min(1).max(8000),
        model: z.enum(["dap-ai-1.0", "dap-ai-lite"]),
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
    if (
      data.model === "dap-ai-1.0" &&
      profile.tier === "free" &&
      profile.pro_messages_used >= FREE_PRO_LIMIT
    ) {
      effectiveModel = "dap-ai-lite";
      forcedToLite = true;
    }

    const { error: insUserErr } = await supabase.from("chat_messages").insert({
      chat_id: data.chatId,
      user_id: userId,
      role: "user",
      content: data.text,
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
    const { data: settings } = await supabaseAdmin
      .from("ai_settings")
      .select("system_prompt")
      .eq("id", "global")
      .maybeSingle();
    const systemPrompt = settings?.system_prompt?.trim() ?? "";

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });

    const messages = [
      ...(systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }]
        : []),
      ...(history ?? []).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    const { url: backend, key } = backendFor(effectiveModel);

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
              model: effectiveModel,
              messages,
              stream: false,
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
          return (
            json?.choices?.[0]?.message?.content ??
            json?.message?.content ??
            errStr ??
            "(empty response)"
          );
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

    // Bump quota counter ONLY when the Pro model was actually used
    if (effectiveModel === "dap-ai-1.0" && profile.tier === "free") {
      await supabase
        .from("profiles")
        .update({ pro_messages_used: profile.pro_messages_used + 1 })
        .eq("id", userId);
    }

    // Return refreshed view
    const { data: messagesOut } = await supabase
      .from("chat_messages")
      .select("id, role, content, model, created_at")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });

    const remainingPro =
      profile.tier === "pro"
        ? null
        : Math.max(
            0,
            FREE_PRO_LIMIT -
              (profile.pro_messages_used +
                (effectiveModel === "dap-ai-1.0" ? 1 : 0))
          );

    return {
      messages: messagesOut ?? [],
      forcedToLite,
      effectiveModel,
      remainingPro,
    };
  });
