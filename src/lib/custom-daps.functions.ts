/**
 * Custom DAPs — a Pro user's own assistant, and the marketplace it can be
 * published to.
 *
 * Who may do what:
 *   create, edit, submit for review  →  Pro and up
 *   browse and install a published one  →  Go and up
 *   approve or reject a submission  →  site_admin
 *
 * Almost none of that is decided here. The quotas, the cooldown, the
 * moderation state machine and the tier checks all live in
 * supabase/migrations/20260817140000_custom_dap_moderation.sql, because the
 * app talks to Supabase with the caller's own key under RLS — a rule
 * enforced only in TypeScript can be stepped around by posting straight to
 * PostgREST. These functions are the door, not the lock.
 *
 * A published DAP's instructions are prepended to the conversation on the
 * Orin hardware; they never replace the model's own system prompt, which is
 * why a submitted prompt is reviewed by a person before anyone else can run
 * it.
 */
import { dbError, userFacingError } from "./db-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DapInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional().default(""),
  emoji: z.string().max(8).optional().default("✨"),
  systemPrompt: z.string().min(1).max(4000),
  opener: z.string().max(1000).optional().default(""),
});

const DAP_COLUMNS =
  "id, name, description, emoji, system_prompt, opener, created_at, published, " +
  "install_count, author_name, mcp_url, moderation_status, submitted_at, " +
  "reviewed_at, rejection_reason";

export type ModerationStatus = "draft" | "pending" | "approved" | "rejected";

export type Dap = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  system_prompt: string;
  opener: string | null;
  created_at: string;
  published: boolean | null;
  install_count: number | null;
  author_name: string | null;
  mcp_url: string | null;
  moderation_status: ModerationStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
};

/** Your own DAPs, whatever state they are in. */
export const listCustomDaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("custom_daps")
      .select(DAP_COLUMNS)
      .order("created_at", { ascending: false })
      .returns<Dap[]>();
    if (error) throw dbError(error, "listCustomDaps");
    return data ?? [];
  });

export const createCustomDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DapInput.parse(i))
  .handler(async ({ context, data }) => {
    // create_custom_dap applies the Pro gate, the three-a-day cap, the
    // one-minute cooldown and the six-per-account trim in one statement.
    const { data: id, error } = await context.supabase.rpc("create_custom_dap", {
      _name: data.name,
      _description: data.description,
      _emoji: data.emoji || "✨",
      _system_prompt: data.systemPrompt,
      _opener: data.opener,
    });
    // Its refusals are written to be read — "wait a minute", "3 today" —
    // so they survive rather than being flattened to a generic message.
    if (error) throw userFacingError(error, "createCustomDap");

    const { data: row } = await context.supabase
      .from("custom_daps")
      .select(DAP_COLUMNS)
      .eq("id", id as string)
      .maybeSingle<Dap>();
    return row;
  });

export const updateCustomDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DapInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("custom_daps")
      .update({
        name: data.name,
        description: data.description,
        emoji: data.emoji || "✨",
        system_prompt: data.systemPrompt,
        opener: data.opener,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw dbError(error, "updateCustomDap");
    return { ok: true };
  });

/**
 * Send it for review.
 *
 * Not "publish" — pressing this puts it in a queue. It can be pressed once
 * a day, not at all while a submission is outstanding, and again only after
 * a rejection or a genuine change to the name, emoji or instructions.
 */
export const submitCustomDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: status, error } = await context.supabase.rpc("submit_custom_dap", {
      _id: data.id,
    });
    if (error) throw userFacingError(error, "submitCustomDap");
    return { status: status as ModerationStatus };
  });

/** Take it off the marketplace. Required before it can be deleted. */
export const unpublishCustomDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("unpublish_custom_dap", {
      _id: data.id,
    });
    if (error) throw userFacingError(error, "unpublishCustomDap");
    return { ok: true };
  });

export const deleteCustomDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    // Refuses while published: someone else may have it installed, and
    // pulling it out from under them should be a deliberate two steps.
    const { error } = await context.supabase.rpc("delete_custom_dap", {
      _id: data.id,
    });
    if (error) throw userFacingError(error, "deleteCustomDap");
    return { ok: true };
  });

/** Decisions the author has not been shown yet. */
export const listMyDapNotices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_dap_notices");
    if (error) throw dbError(error, "myDapNotices");
    return data ?? [];
  });

/** Mark them read, so a rejection is delivered once rather than nagging. */
export const markDapNoticesSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("mark_dap_notices_seen");
    if (error) throw dbError(error, "markDapNoticesSeen");
    return { ok: true };
  });

export const listMarketplaceDaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Approved and published only, Go and up — enforced inside the function.
    const { data, error } = await supabase.rpc("marketplace_daps");
    if (error) throw userFacingError(error, "marketplaceDaps");

    const { data: mine } = await supabase
      .from("custom_daps")
      .select("source_id")
      .eq("user_id", userId);
    const installed = new Set(
      (mine ?? []).map((m: { source_id: string | null }) => m.source_id).filter(Boolean)
    );
    return (data ?? []).map((d: any) => ({
      ...d,
      mine: d.user_id === userId,
      installed: installed.has(d.id),
    }));
  });

export const installMarketplaceDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ sourceId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: newId, error } = await context.supabase.rpc("install_custom_dap", {
      _source_id: data.sourceId,
    });
    if (error) throw userFacingError(error, "installCustomDap");
    return { id: newId as string };
  });

// ── Moderation, for the admin console ──────────────────────────────────

export const adminListDapSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_dap_submissions");
    if (error) throw userFacingError(error, "adminListDapSubmissions");
    return data ?? [];
  });

export const adminReviewDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { data: status, error } = await context.supabase.rpc("admin_review_dap", {
      _id: data.id,
      _approve: data.approve,
      _reason: data.reason ?? undefined,
    });
    if (error) throw userFacingError(error, "adminReviewDap");
    return { status: status as ModerationStatus };
  });
