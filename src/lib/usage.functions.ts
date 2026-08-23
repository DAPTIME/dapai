/**
 * Usage summary for the account page: DAP Track levels built vs. quota.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-error";
import { TRACK_QUOTA } from "@/lib/track-quota";
import type { Tier } from "@/lib/tier-rank";

export type UsageSummary = {
  tier: Tier;
  /** DAP Track levels built, and how many this plan allows. */
  tracks: { used: number; limit: number };
};

export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageSummary> => {
    const { supabase, userId } = context;

    const [profileRes, tracksRes] = await Promise.all([
      supabase.from("profiles").select("tier").eq("id", userId).maybeSingle(),
      supabase.from("custom_tracks").select("id", { count: "exact", head: true }).eq("owner_id", userId),
    ]);

    if (profileRes.error) throw dbError(profileRes.error, "getMyUsage");

    const tier = ((profileRes.data?.tier as Tier) ?? "free");

    return {
      tier,
      tracks: { used: tracksRes.count ?? 0, limit: TRACK_QUOTA[tier] },
    };
  });
