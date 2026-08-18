import { dbError } from "./db-error";
/**
 * Admin server functions. Caller must have the 'admin' role.
 * Uses supabaseAdmin to bypass RLS; gate enforcement is in code via has_role.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdmin,
  getAdminClient,
  isAdminUser,
  AdminCheckError,
  type AdminCheckProblem,
} from "@/lib/admin.server";
import { assertAdminSecret } from "@/lib/admin-secret.server";
import { FEATURE_KEYS, MODEL_IDS, type FeatureKey } from "@/lib/admin-config";
import { DEFAULT_OFFLINE_MESSAGE } from "@/lib/site-config.functions";
import { SITE_STATUSES, parseSiteStatus, type SiteStatus } from "@/lib/site-status";


export const adminListAllChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    /* Falls back to the old column list until the soft-delete migration
       has run, so the console keeps working across the gap between a
       deploy and its migration. */
    type AdminChatRow = {
      id: string; title: string; user_id: string;
      created_at: string; updated_at: string;
      deleted_at?: string | null; is_incognito?: boolean | null;
    };
    let { data: chats, error } = (await supabaseAdmin
      .from("chats")
      .select("id, title, user_id, created_at, updated_at, deleted_at, is_incognito")
      .order("updated_at", { ascending: false })
      .limit(500)) as { data: AdminChatRow[] | null; error: unknown };
    if (error) {
      ({ data: chats, error } = (await supabaseAdmin
        .from("chats")
        .select("id, title, user_id, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500)) as { data: AdminChatRow[] | null; error: unknown });
    }
    if (error) throw dbError(error as { message?: string });
    const userIds = Array.from(new Set((chats ?? []).map((c) => c.user_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    // Retired chats are kept indefinitely and listed here alongside live
    // ones; the console marks which is which rather than hiding either.
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
        .select("id, role, content, model, ip, created_at")
        .eq("chat_id", data.chatId)
        .order("created_at", { ascending: true }),
    ]);
    if (error) throw dbError(error);
    return { chat, messages: messages ?? [] };
  });

/**
 * Admins can delete any chat for real, messages and all.
 *
 * The only route by which a chat actually leaves the database — a user's
 * own delete just flags the row. Irreversible.
 */
export const adminDeleteChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ chatId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    assertAdminSecret();
    const supabaseAdmin = getAdminClient();
    const { error: msgErr } = await supabaseAdmin
      .from("chat_messages")
      .delete()
      .eq("chat_id", data.chatId);
    if (msgErr) throw dbError(msgErr);
    const { error } = await supabaseAdmin
      .from("chats")
      .delete()
      .eq("id", data.chatId);
    if (error) throw dbError(error);
    return { ok: true };
  });

const TIERS = ["free", "go", "pro", "exclusive"] as const;
type TierId = (typeof TIERS)[number];

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name, tier, pro_messages_used, created_at, banned")
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);

    // Ban state is profiles.banned now — the same checkbox the table editor
    // shows — so it comes back with the row above. Email confirmation still
    // only exists on the auth user.
    const unconfirmed = new Set<string>();
    try {
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      for (const u of authList?.users ?? []) {
        if (!u.email_confirmed_at) unconfirmed.add(u.id);
      }
    } catch (e) {
      console.error("[admin] listUsers auth lookup failed:", (e as Error).message);
    }

    return (data ?? []).map((p) => ({
      ...p,
      banned: p.banned === true,
      emailConfirmed: !unconfirmed.has(p.id),
    }));
  });

export const adminSetBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ userId: z.string().uuid(), banned: z.boolean() }).parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    assertAdminSecret();
    if (data.userId === context.userId)
      throw new Error("You can't ban your own admin account.");
    const supabaseAdmin = getAdminClient();
    // Write the column, not the Auth API. A trigger mirrors it into
    // auth.users.banned_until, so the console button and the table editor
    // checkbox are the same switch rather than two that can disagree.
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ banned: data.banned })
      .eq("id", data.userId);
    if (error) throw dbError(error);
    return { ok: true };
  });

export const adminSetTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        tier: z.enum(TIERS),
        resetUsage: z.boolean().optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    assertAdminSecret();
    const supabaseAdmin = getAdminClient();
    const patch: { tier: TierId; pro_messages_used?: number } = {
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


/**
 * A failed lookup — no service role key, no database — is a different thing
 * from an account without the role, and the console needs to say which one
 * happened. The failure is returned rather than thrown so the page gets the
 * reason instead of an opaque request error.
 */
export const adminAmIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      isAdmin: boolean;
      problem?: AdminCheckProblem;
      detail?: string;
    }> => {
      try {
        return { isAdmin: await isAdminUser(context.userId) };
      } catch (e) {
        if (e instanceof AdminCheckError) {
          // Service-role path unavailable (missing key / db hiccup). The
          // caller can still read their OWN profile row under RLS, which is
          // the same source of truth, so admins are not locked out.
          const { data } = await context.supabase
            .from("profiles")
            .select("site_admin")
            .eq("id", context.userId)
            .maybeSingle();
          if (data?.site_admin === true) return { isAdmin: true };
          return { isAdmin: false, problem: e.problem, detail: e.detail };
        }
        throw e;
      }

    },
  );

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        email: z.string().trim().email().max(255).optional(),
        tier: z.enum(TIERS).optional(),
        resetUsage: z.boolean().optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    assertAdminSecret();
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
      tier?: TierId;
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
    assertAdminSecret();
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
    assertAdminSecret();
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
    assertAdminSecret();
    const supabaseAdmin = getAdminClient();
    if (data.userId === context.userId) {
      throw new Error("You can't delete your own admin account.");
    }
    // Delete the auth user; profile/role rows cascade via ON DELETE CASCADE.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
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
    const status = parseSiteStatus(data?.system_prompt);
    // enabled is kept alongside status so existing callers that only ask
    // "is the site up for the public" keep working unchanged.
    return { status, enabled: status === "on" };
  }
);

export const adminSetSiteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        // enabled stays accepted so a client mid-deploy that still sends a
        // boolean does not start failing; status wins when both arrive.
        status: z.enum(SITE_STATUSES).optional(),
        enabled: z.boolean().optional(),
      })
      .refine((v) => v.status !== undefined || v.enabled !== undefined, {
        message: "A status is required.",
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    assertAdminSecret();
    const status: SiteStatus =
      data.status ?? (data.enabled ? "on" : "off");
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.from("ai_settings").upsert({
      id: "site_status",
      system_prompt: status,
      updated_at: new Date().toISOString(),
    });
    if (error) throw dbError(error);
    return { ok: true };
  });

/**
 * Admin-authored text shown in the typing bar while DAP AI is offline.
 * Stored in ai_settings (id="offline_message"). Public read, admin write.
 */
export const getOfflineMessage = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabaseAdmin = getAdminClient();
    const { data } = await supabaseAdmin
      .from("ai_settings")
      .select("system_prompt")
      .eq("id", "offline_message")
      .maybeSingle();
    const message = (data?.system_prompt ?? "").trim();
    return { message: message || DEFAULT_OFFLINE_MESSAGE };
  }
);

export const adminSetOfflineMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ message: z.string().trim().max(300) }).parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    assertAdminSecret();
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.from("ai_settings").upsert({
      id: "offline_message",
      system_prompt: data.message || DEFAULT_OFFLINE_MESSAGE,
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
    const flags = Object.fromEntries(
      FEATURE_KEYS.map((k) => [k, true])
    ) as Record<FeatureKey, boolean>;
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
    assertAdminSecret();
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.from("ai_settings").upsert({
      id: `feature_${data.key}`,
      system_prompt: data.enabled ? "on" : "off",
      updated_at: new Date().toISOString(),
    });
    if (error) throw dbError(error);
    return { ok: true };
  });
