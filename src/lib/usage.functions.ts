/**
 * Everything the account page needs to show what a plan is being used for.
 *
 * One round trip rather than four, because the page shows them together
 * and four separate spinners settling at different moments reads as a
 * broken page.
 *
 * The token balances come from my_usage() rather than from a direct read
 * of usage_quota: the function rolls the day and week windows before
 * answering, so a ledger row left over from yesterday reads as a full
 * balance instead of yesterday's spend. The table itself is not readable
 * by the caller at all.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-error";
import { TRACK_QUOTA } from "@/lib/track-quota";
import { CHAT_HISTORY_LIMIT } from "@/lib/usage-limits";
import type { Tier } from "@/lib/tier-rank";

export type UsageSummary = {
  tier: Tier;
  /** Chats kept in history, and how many this plan keeps. */
  chats: { used: number; limit: number };
  /** DAP Track levels built, and how many this plan allows. */
  tracks: { used: number; limit: number };
  /** Usage tokens spent today, and the plan's daily allowance. */
  tokensToday: { used: number; limit: number | null };
  /** Usage tokens spent this week, and the plan's weekly allowance. */
  tokensWeek: { used: number; limit: number | null };
  /** Images attached today, and the plan's daily allowance. */
  imagesToday: { used: number; limit: number | null };
};

export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageSummary> => {
    const { supabase, userId } = context;

    const [profileRes, chatsRes, tracksRes, ledgerRes] = await Promise.all([
      supabase.from("profiles").select("tier").eq("id", userId).maybeSingle(),
      supabase.from("chats").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("custom_tracks").select("id", { count: "exact", head: true }).eq("owner_id", userId),
      supabase.rpc("my_usage").maybeSingle(),
    ]);

    if (profileRes.error) throw dbError(profileRes.error, "getMyUsage");

    const tier = ((profileRes.data?.tier as Tier) ?? "free");
    // A ledger read that fails should not take the whole page down; the
    // rest of the panel is still worth showing.
    if (ledgerRes.error) {
      console.error("[usage] my_usage failed:", ledgerRes.error.message);
    }
    const led = ledgerRes.data as {
      day_used?: number; day_limit?: number | null;
      week_used?: number; week_limit?: number | null;
      images_used?: number; images_limit?: number | null;
    } | null;

    return {
      tier,
      chats: { used: chatsRes.count ?? 0, limit: CHAT_HISTORY_LIMIT[tier] },
      tracks: { used: tracksRes.count ?? 0, limit: TRACK_QUOTA[tier] },
      tokensToday: { used: Number(led?.day_used ?? 0), limit: led?.day_limit ?? null },
      tokensWeek: { used: Number(led?.week_used ?? 0), limit: led?.week_limit ?? null },
      imagesToday: { used: Number(led?.images_used ?? 0), limit: led?.images_limit ?? null },
    };
  });
