/**
 * Models as data.
 *
 * They used to be a hardcoded array, so adding one, renaming one, or
 * changing the order meant a deploy. They now live in public.ai_models and
 * are managed from the admin console.
 *
 * Two rules worth keeping in mind when reading this file:
 *
 *  - `label` is not decoration. It is the exact string sent to the
 *    orchestrator as the model to route on, so renaming a model changes
 *    what the hardware is asked for. The admin UI says so.
 *  - Nothing here decides whether a caller may *use* a model. That gate
 *    lives with the send paths, which re-check min_tier against the
 *    account. This module only describes what exists.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin.server";
import { assertAdminSecret } from "@/lib/admin-secret.server";
import { dbError } from "./db-error";
import { MODELS as FALLBACK_MODELS, type ModelInfo } from "./models";
const TIERS = ["free", "go", "pro", "exclusive"] as const;

export interface StoredModel {
  id: string;
  label: string;
  description: string;
  min_tier: string;
  lite: boolean;
  enabled: boolean;
  sort_order: number;
}

/** Shape the app already understands, so callers need no changes. */
function toModelInfo(row: StoredModel): ModelInfo {
  return {
    id: row.id as ModelInfo["id"],
    label: row.label,
    description: row.description,
    minTier: row.min_tier as ModelInfo["minTier"],
    // Feature flags stay keyed to the three original models; a model added
    // later simply has no flag and is governed by `enabled` instead.
    flag: (FALLBACK_MODELS.find((m) => m.id === row.id)?.flag ??
      "ai_enabled") as ModelInfo["flag"],
    lite: row.lite,
  };
}

/**
 * Every model, in display order. Public: the picker renders for signed-out
 * visitors too.
 *
 * Falls back to the compiled-in list if the table cannot be read, so a
 * database hiccup degrades to "the three we shipped with" rather than an
 * empty picker.
 */
export const listModels = createServerFn({ method: "GET" }).handler(
  async (): Promise<ModelInfo[]> => {
    try {
      const { tryAdminClient } = await import("./admin-client.server");
      const admin = await tryAdminClient();
      if (!admin) return FALLBACK_MODELS;
      const { data, error } = await admin
        .from("ai_models")
        .select("id, label, description, min_tier, lite, enabled, sort_order")
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error || !data?.length) return FALLBACK_MODELS;
      return (data as StoredModel[]).map(toModelInfo);
    } catch {
      return FALLBACK_MODELS;
    }
  }
);

/** Every model including disabled ones, for the console. */
export const adminListModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoredModel[]> => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_models")
      .select("id, label, description, min_tier, lite, enabled, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw dbError(error);
    return (data ?? []) as StoredModel[];
  });

const ModelInput = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Use lowercase letters, numbers, dots, dashes."),
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).default(""),
  min_tier: z.enum(TIERS),
  lite: z.boolean(),
  enabled: z.boolean(),
  sort_order: z.number().int().min(0).max(10_000),
});

export const adminSaveModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ModelInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId, context.supabase);
    assertAdminSecret();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_models").upsert(data, { onConflict: "id" });
    if (error) throw dbError(error);
    return { ok: true };
  });

export const adminDeleteModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().trim().min(1).max(64) }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId, context.supabase);
    assertAdminSecret();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    /* Refuse to remove the last usable model. An empty picker is an outage,
       and it would be caused by a single click with no obvious way back. */
    const { count } = await supabaseAdmin
      .from("ai_models")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true);
    if ((count ?? 0) <= 1) {
      throw new Error(
        "This is the last enabled model. Add or enable another one before removing it."
      );
    }

    const { error } = await supabaseAdmin.from("ai_models").delete().eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true };
  });

/** Reorder in one call, so the list cannot be left half-renumbered. */
export const adminReorderModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ ids: z.array(z.string().trim().min(1).max(64)).min(1).max(50) }).parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId, context.supabase);
    assertAdminSecret();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let i = 0; i < data.ids.length; i++) {
      const { error } = await supabaseAdmin
        .from("ai_models")
        .update({ sort_order: (i + 1) * 10 })
        .eq("id", data.ids[i]!);
      if (error) throw dbError(error);
    }
    return { ok: true };
  });
