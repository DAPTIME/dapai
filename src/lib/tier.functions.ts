import { dbError } from "./db-error";
/**
 * Letting an account lower its own plan.
 *
 * Upgrades stay manual — they go through a conversation, which is the
 * point of them. Coming back down should not need anyone's attention,
 * so it is self-service.
 *
 * The whole risk in a "user sets their own tier" endpoint is that it can
 * be turned into a way to grant tiers. Two things stop that here. The
 * comparison is done server side against the tier read from the
 * database, never against anything the client sent; and the direction is
 * checked explicitly — a target that is not strictly below the current
 * plan is refused rather than clamped, so a request to move up is an
 * error and not a silent no-op that might later be loosened by accident.
 *
 * The ranking is an explicit map rather than the account_tier enum's own
 * ordering. Enum comparison follows declaration order, and 'go' and
 * 'exclusive' were added to that type after 'pro', so 'go' > 'pro' in
 * SQL. Ordering by the enum would let someone "downgrade" from Pro to Go
 * and come out ahead.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminClient } from "@/lib/admin.server";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";

const TIERS = ["free", "go", "pro", "exclusive"] as const;

export const downgradeOwnTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tier: z.enum(TIERS) }).parse(i))
  .handler(async ({ context, data }) => {
    const supabaseAdmin = getAdminClient();

    // The current plan comes from the database, not the caller.
    const { data: row, error: readErr } = await supabaseAdmin
      .from("profiles")
      .select("tier")
      .eq("id", context.userId)
      .maybeSingle();
    if (readErr) throw dbError(readErr);
    if (!row) throw new Error("Profile not found");

    const from = (row.tier ?? "free") as Tier;
    const to = data.tier as Tier;

    if (TIER_RANK[to] >= TIER_RANK[from]) {
      throw new Error(
        "This endpoint only lowers a plan. Upgrades are arranged with the team."
      );
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ tier: to })
      .eq("id", context.userId);
    if (error) throw dbError(error);

    return { from, to };
  });
