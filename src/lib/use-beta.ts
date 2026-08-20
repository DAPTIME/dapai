/**
 * Who may use a feature that is in beta.
 *
 * A feature has two independent gates. The ordinary flag decides whether it
 * exists at all; the beta setting decides which plans may reach it while it
 * is still being tried out. Both have to pass, and the beta floor is never
 * below Go — see BETA_MIN_TIER.
 *
 * Kept in one place because the answer is needed in several: the sidebar
 * dims and badges an entry, the page itself has to turn people away, and
 * the account's own tier has to be read the same way in both.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProfile } from "@/lib/chats.functions";
import { useAuth } from "@/lib/auth";
import { useSiteConfig } from "@/lib/site-config";
import type { FeatureKey } from "@/lib/site-config.functions";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";

export interface BetaState {
  /** Is this feature in beta at all? */
  isBeta: boolean;
  /** Lowest plan that may use it while in beta, when it is. */
  minTier: Tier | null;
  /** May this account use it, counting the ordinary flag as well? */
  allowed: boolean;
  /** In beta and this account is not high enough. */
  lockedByBeta: boolean;
}

/** The signed-in account's plan, from the same cached read the sidebar uses. */
export function useMyTier(): Tier {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getProfile);
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
    staleTime: 15_000,
  });
  return ((profileQuery.data?.tier as Tier | undefined) ?? "free") as Tier;
}

export function useBeta(): (key: FeatureKey) => BetaState {
  const siteConfig = useSiteConfig();
  const tier = useMyTier();

  return (key: FeatureKey): BetaState => {
    const minTier = siteConfig.beta[key] ?? null;
    const flagOn = siteConfig.flags[key] !== false;
    const highEnough = minTier === null || TIER_RANK[tier] >= TIER_RANK[minTier];
    return {
      isBeta: minTier !== null,
      minTier,
      allowed: flagOn && highEnough,
      lockedByBeta: minTier !== null && !highEnough,
    };
  };
}

/** Sentence for someone who cannot reach a beta yet. */
export function betaLockMessage(label: string, minTier: Tier): string {
  const plan =
    minTier === "go" ? "DAP AI 4 Pro Lite" : minTier === "pro" ? "DAP AI 4 Pro" : "Exclusive";
  return `${label} is in beta — it needs the ${plan} plan while we're testing it.`;
}
