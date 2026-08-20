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
import { adminAmIAdmin } from "@/lib/admin.functions";
import { useSiteConfig } from "@/lib/site-config";
import type { FeatureKey } from "@/lib/site-config.functions";
import { TIER_RANK, TIER_LABEL, type Tier } from "@/lib/tier-rank";

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

/**
 * The signed-in account's plan, from the same cached read the sidebar uses,
 * and whether we actually know it yet.
 *
 * `ready` matters more than it looks. The profile arrives a moment after
 * the first render, and until it does the tier is unknown — reading that as
 * "free" is what made the page guard throw a Pro account off a Pro-gated
 * beta before its own plan had loaded. A signed-out visitor is free and
 * that is known immediately, so they are ready straight away.
 */
export function useMyTier(): { tier: Tier; ready: boolean } {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getProfile);
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
    staleTime: 15_000,
  });
  const tier = ((profileQuery.data?.tier as Tier | undefined) ?? "free") as Tier;
  const ready = !user || profileQuery.isSuccess || profileQuery.isError;
  return { tier, ready };
}

export function useBeta(): (key: FeatureKey) => BetaState {
  const siteConfig = useSiteConfig();
  const { user } = useAuth();
  const { tier, ready } = useMyTier();

  /* Admins are never held out of a beta. They are the people who turn one
     on, and being unable to open the thing you just gated makes the switch
     untestable. Same exemption the sidebar already makes. */
  const amIAdmin = useServerFn(adminAmIAdmin);
  const adminQuery = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => amIAdmin(),
    enabled: !!user,
    retry: false,
  });
  const isAdmin = adminQuery.data?.isAdmin === true;

  return (key: FeatureKey): BetaState => {
    const minTier = siteConfig.beta[key] ?? null;
    const flagOn = siteConfig.flags[key] !== false;
    /* Nothing is locked until the plan is known. Guessing "free" during
       that gap turned a slow profile read into a redirect off the page. */
    const highEnough =
      minTier === null || !ready || isAdmin || TIER_RANK[tier] >= TIER_RANK[minTier];
    return {
      isBeta: minTier !== null,
      minTier,
      allowed: flagOn && highEnough,
      lockedByBeta: minTier !== null && !highEnough,
    };
  };
}

/**
 * Sentence for someone who cannot reach a beta yet.
 *
 * Named after the plan, not a model: the tiers are Free, Go, Pro and
 * Exclusive, and "DAP AI 4 Pro Lite" is a model Go accounts may use, not
 * the name of the plan itself.
 */
export function betaLockMessage(label: string, minTier: Tier): string {
  return `${label} is in beta — it needs the ${TIER_LABEL[minTier]} plan while we're testing it.`;
}
