import { dbError } from "./db-error";
/**
 * Admin server functions. Caller must have the 'admin' role.
 * Uses supabaseAdmin to bypass RLS; gate enforcement is in code via has_role.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, getAdminClient } from "@/lib/admin.server";
import { FEATURE_KEYS, MODEL_IDS, type FeatureKey } from "@/lib/admin-config";

export const adminListAllChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { data: chats, error } = await supabaseAdmin
      .from("chats")
      .select("id, title, user_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
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
    const supabaseAdmin = getAdminClient();
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
    if (error) throw dbError(error);
    return { chat, messages: messages ?? [] };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name, tier, pro_messages_used, created_at")
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
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
    const supabaseAdmin = getAdminClient();
    const patch: { tier: "free" | "pro"; pro_messages_used?: number } = {
      tier: data.tier,
    };
    if (data.resetUsage) patch.pro_messages_used = 0;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", data.userId);
    if (error) throw dbError(error);
    return { ok: true };
  });

export const adminAmIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await assertAdmin(context.userId);
      return { isAdmin: true };
    } catch {
      return { isAdmin: false };
    }
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        email: z.string().trim().email().max(255).optional(),
        tier: z.enum(["free", "pro"]).optional(),
        resetUsage: z.boolean().optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    if (data.email) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        data.userId,
        { email: data.email, email_confirm: true }
      );
      if (error) throw dbError(error);
    }
    const patch: {
      name?: string;
      email?: string;
      tier?: "free" | "pro";
      pro_messages_used?: number;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.email !== undefined) patch.email = data.email;
    if (data.tier !== undefined) patch.tier = data.tier;
    if (data.resetUsage) patch.pro_messages_used = 0;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(patch)
        .eq("id", data.userId);
      if (error) throw dbError(error);
    }
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        newPassword: z.string().min(8).max(128),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: data.newPassword }
    );
    if (error) throw dbError(error);
    return { ok: true };
  });

export const adminConfirmEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { email_confirm: true }
    );
    if (error) throw dbError(error);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    if (data.userId === context.userId) {
      throw new Error("You can't delete your own admin account.");
    }
    // Delete the auth user; profile/role rows cascade via ON DELETE CASCADE.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw dbError(error);
    return { ok: true };
  });



export const adminGetSystemPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ model: z.enum(MODEL_IDS).optional() })
      .parse(i ?? {})
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const id: string = data.model ?? "global";
    const { data: row, error } = await supabaseAdmin
      .from("ai_settings")
      .select("system_prompt, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw dbError(error);
    // Fallback to legacy "global" row when a per-model prompt isn't set yet.
    let systemPrompt = row?.system_prompt ?? "";
    let updatedAt = row?.updated_at ?? null;
    if (!row && data.model) {
      const { data: legacy } = await supabaseAdmin
        .from("ai_settings")
        .select("system_prompt, updated_at")
        .eq("id", "global")
        .maybeSingle();
      systemPrompt = legacy?.system_prompt ?? "";
      updatedAt = legacy?.updated_at ?? null;
    }
    return { systemPrompt, updatedAt };
  });

export const adminSetSystemPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        systemPrompt: z.string().max(8000),
        model: z.enum(MODEL_IDS).optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const id: string = data.model ?? "global";
    const { error } = await supabaseAdmin
      .from("ai_settings")
      .upsert({
        id,
        system_prompt: data.systemPrompt,
        updated_at: new Date().toISOString(),
      });
    if (error) throw dbError(error);
    return { ok: true };
  });

/**
 * Site enable/disable. Stored in ai_settings (id="site_status"),
 * using the system_prompt column to hold "on" or "off".
 * Public read (anyone can check), admin-only write.
 */
export const getSiteStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabaseAdmin = getAdminClient();
    const { data } = await supabaseAdmin
      .from("ai_settings")
      .select("system_prompt")
      .eq("id", "site_status")
      .maybeSingle();
    const enabled =
      (data?.system_prompt ?? "on").trim().toLowerCase() !== "off";
    return { enabled };
  }
);

export const adminSetSiteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ enabled: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.from("ai_settings").upsert({
      id: "site_status",
      system_prompt: data.enabled ? "on" : "off",
      updated_at: new Date().toISOString(),
    });
    if (error) throw dbError(error);
    return { ok: true };
  });

/**
 * Per-feature on/off toggles. Stored as ai_settings rows with id
 * `feature_<key>` and "on"/"off" in system_prompt. Public read.
 */
export const getFeatureFlags = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabaseAdmin = getAdminClient();
    const ids = FEATURE_KEYS.map((k) => `feature_${k}`);
    const { data } = await supabaseAdmin
      .from("ai_settings")
      .select("id, system_prompt")
      .in("id", ids);
    const flags: Record<FeatureKey, boolean> = {
      pro_model: true,
      lite_model: true,
      daps: true,
      team: true,
      games: true,
    };
    for (const row of data ?? []) {
      const key = row.id.replace(/^feature_/, "") as FeatureKey;
      if ((FEATURE_KEYS as readonly string[]).includes(key)) {
        flags[key] =
          (row.system_prompt ?? "on").trim().toLowerCase() !== "off";
      }
    }
    return flags;
  }
);

export const adminSetFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        key: z.enum(FEATURE_KEYS),
        enabled: z.boolean(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.from("ai_settings").upsert({
      id: `feature_${data.key}`,
      system_prompt: data.enabled ? "on" : "off",
      updated_at: new Date().toISOString(),
    });
    if (error) throw dbError(error);
    return { ok: true };
  });
