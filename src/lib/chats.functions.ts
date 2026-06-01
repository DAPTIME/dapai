/**
 * Server functions for chats. All run as the authenticated user so RLS
 * scopes every read/write to that user's rows.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FREE_PRO_LIMIT = 5;

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
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: userId, title: "New chat" })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data;
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
    return { ...data, remainingPro, freeProLimit: FREE_PRO_LIMIT };
  });

/**
 * Send a chat message:
 *  - enforces tier limits (free tier gets FREE_PRO_LIMIT DAP AI 3.2 msgs)
 *  - stores the user message, calls the relay, stores the assistant reply
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
        systemPrompt: z.string().max(8000).optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Load profile to check tier & quota
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("tier, pro_messages_used")
      .eq("id", userId)
      .single();
    if (pErr) throw new Error(pErr.message);

    // Tier gate: free users get FREE_PRO_LIMIT DAP AI 3.2 (dap-ai-1.0) msgs.
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

    // Insert user message
    const { error: insUserErr } = await supabase.from("chat_messages").insert({
      chat_id: data.chatId,
      user_id: userId,
      role: "user",
      content: data.text,
      model: effectiveModel,
    });
    if (insUserErr) throw new Error(insUserErr.message);

    // Update chat title if it's still default
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

    // Gather full history for the model
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });

    const messages = [
      ...(data.systemPrompt?.trim()
        ? [{ role: "system" as const, content: data.systemPrompt }]
        : []),
      ...(history ?? []).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    // Call relay (same /api/chat as before). On the server we hit it via
    // localhost-equivalent fetch using the request origin.
    const backend = process.env.AI_BACKEND_URL;
    let replyText = "";
    if (!backend) {
      replyText =
        "No AI backend configured yet. Set AI_BACKEND_URL to your PC's tunnel running LM Studio or Ollama.";
    } else {
      try {
        const key = process.env.AI_BACKEND_KEY;
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
          error?: string;
        };
        replyText =
          json?.choices?.[0]?.message?.content ??
          json?.message?.content ??
          json?.error ??
          "(empty response)";
      } catch (e) {
        replyText = `Couldn't reach AI backend: ${(e as Error).message}`;
      }
    }

    // Insert assistant message
    await supabase.from("chat_messages").insert({
      chat_id: data.chatId,
      user_id: userId,
      role: "assistant",
      content: replyText,
      model: effectiveModel,
    });

    // Bump quota counter ONLY when the pro model was actually used
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
