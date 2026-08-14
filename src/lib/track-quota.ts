/**
 * How many tracks a plan may keep.
 *
 * The database holds the same numbers in public.track_quota() and enforces
 * them with a BEFORE INSERT trigger, because the app writes through the
 * caller's own key under RLS — a limit checked only here could be stepped
 * around by posting straight to PostgREST. This copy exists so the editor
 * can say "2 of 3 used" before anyone hits the wall.
 *
 * Keep the two in step.
 */
import type { Tier } from "@/lib/tier-rank";

/** Infinity means unlimited, so callers can compare without a null check. */
export const TRACK_QUOTA: Record<Tier, number> = {
  free: 1,
  go: 3,
  pro: 10,
  exclusive: Number.POSITIVE_INFINITY,
};

export function quotaLabel(tier: Tier): string {
  const q = TRACK_QUOTA[tier];
  return Number.isFinite(q) ? String(q) : "unlimited";
}
