import { type Tier } from "@/lib/tier-rank";

/**
 * How many tracks a plan may keep. Free accounts can play and browse but
 * not build; Exclusive is unlimited.
 */
export const TRACK_QUOTA: Record<Tier, number> = {
  free: 0,
  go: 3,
  pro: 10,
  exclusive: Number.POSITIVE_INFINITY,
};
