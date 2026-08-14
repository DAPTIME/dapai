/**
 * Everything the account page needs to show what a plan is being used for.
 *
 * One round trip rather than four, because the page shows them together
 * and four separate spinners settling at different moments reads as a
 * broken page.
 *
 * Note what is *not* here: a message quota. pro_messages_used is counted
 * but nothing checks it, so there is no limit to report yet. When the
 * token allowance lands it belongs in usage-limits.ts and gets surfaced
 * through this one function.
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
  /** Messages sent on the Pro model. No ceiling is enforced yet. */
  proMessages: { used: number; limit: number | null };
};

export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageSummary> => {
    const { supabase, userId } = context;

    const [profileRes, chatsRes, tracksRes] = await Promise.all([
      supabase.from("profiles").select("tier, pro_messages_used").eq("id", userId).maybeSingle(),
      supabase.from("chats").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("custom_tracks").select("id", { count: "exact", head: true }).eq("owner_id", userId),
    ]);

    if (profileRes.error) throw dbError(profileRes.error, "getMyUsage");

    const tier = ((profileRes.data?.tier as Tier) ?? "free");
    return {
      tier,
      chats: { used: chatsRes.count ?? 0, limit: CHAT_HISTORY_LIMIT[tier] },
      tracks: { used: tracksRes.count ?? 0, limit: TRACK_QUOTA[tier] },
      proMessages: { used: profileRes.data?.pro_messages_used ?? 0, limit: null },
    };
  });
