/**
 * Per-account car tuning for DAP Track.
 *
 * One account gets a stronger engine. The decision is made here rather
 * than in the browser so the rule lives in one place and is keyed on the
 * account the server authenticated, not on anything the page claims
 * about itself. The browser asks and is told a number.
 *
 * Be clear about what this is and is not. The simulation runs on the
 * client, so a determined person can edit the number in their own
 * browser whatever this returns — client-side physics cannot be
 * enforced. It is not a security control, and no leaderboard integrity
 * should be built on it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminClient } from "@/lib/admin.server";
import type { CarTuning } from "@/lib/poly-physics";

/** Accounts with a stronger engine, compared lowercased. */
const TUNED_ACCOUNTS = new Set(["pancholiadevansh@gmail.com"]);

/**
 * Pull, not top speed. stepCar clamps to MAX_SPEED after applying this,
 * so a tuned car reaches 100 km/h sooner and not a single km/h past it.
 */
const TUNED_ENGINE_SCALE = 1.6;

export const getRacePerks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CarTuning> => {
    const supabaseAdmin = getAdminClient();
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();

    const email = (data?.email ?? "").trim().toLowerCase();
    return { engineScale: TUNED_ACCOUNTS.has(email) ? TUNED_ENGINE_SCALE : 1 };
  });
