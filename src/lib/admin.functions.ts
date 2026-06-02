/**
 * Admin server functions. Caller must have the 'admin' role.
 * Uses supabaseAdmin to bypass RLS; gate enforcement is in code via has_role.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const adminListAllChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: chats, error } = await supabaseAdmin
      .from("chats")
      .select("id, title, user_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((chats ?? []).map((c) => c.user_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (chats ?? []).map((c) => ({
      ...c,
      user_email: map.get(c.user_id)?.email ?? null,
      user_name: map.get(c.user_id)?.name ?? null,
    }));
  });

export const adminGetChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ chatId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const [{ data: chat }, { data: messages, error }] = await Promise.all([
      supabaseAdmin
        .from("chats")
        .select("id, title, user_id, created_at, updated_at")
        .eq("id", data.chatId)
        .single(),
      supabaseAdmin
        .from("chat_messages")
        .select("id, role, content, model, created_at")
        .eq("chat_id", data.chatId)
        .order("created_at", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);
    return { chat, messages: messages ?? [] };
  });

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name, tier, pro_messages_used, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const adminSetTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        tier: z.enum(["free", "pro"]),
        resetUsage: z.boolean().optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const patch: { tier: "free" | "pro"; pro_messages_used?: number } = {
      tier: data.tier,
    };
    if (data.resetUsage) patch.pro_messages_used = 0;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAmIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const adminGetSystemPrompt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("ai_settings")
      .select("system_prompt, updated_at")
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      systemPrompt: data?.system_prompt ?? "",
      updatedAt: data?.updated_at ?? null,
    };
  });

export const adminSetSystemPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ systemPrompt: z.string().max(8000) }).parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("ai_settings")
      .upsert({
        id: "global",
        system_prompt: data.systemPrompt,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
