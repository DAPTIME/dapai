import { useMyProfile } from "@/lib/use-my-profile";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";

const AD_FREE_MIN_TIER: Tier = "pro";

/**
 * True once we know the signed-in user's tier is "pro" or above.
 * SSR-safe: useMyProfile is disabled without a user and query data is
 * undefined until it resolves, so this defaults to false (ads shown).
 */
export function useAdFree(): boolean {
  const { data } = useMyProfile();
  const tier = (data?.tier as Tier | undefined) ?? undefined;
  if (!tier) return false;
  return TIER_RANK[tier] >= TIER_RANK[AD_FREE_MIN_TIER];
}
