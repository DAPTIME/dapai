/**
 * Plan summary for the account page.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-error";
import type { Tier } from "@/lib/tier-rank";

export type UsageSummary = {
  tier: Tier;
};

export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageSummary> => {
    const { supabase, userId } = context;

    const profileRes = await supabase
      .from("profiles")
      .select("tier")
      .eq("id", userId)
      .maybeSingle();

    if (profileRes.error) throw dbError(profileRes.error, "getMyUsage");

    return { tier: ((profileRes.data?.tier as Tier) ?? "free") };
  });
