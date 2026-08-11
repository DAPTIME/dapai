/**
 * The plan ladder, on its own so both sides can share it.
 *
 * tier-gate.tsx is a React component and the downgrade endpoint runs on
 * the server; neither should have to import the other to agree on which
 * plan outranks which.
 *
 * Explicit numbers rather than the account_tier enum's own ordering:
 * enum comparison follows declaration order, and 'go' and 'exclusive'
 * were added to that type after 'pro', so ordering by the enum would put
 * Go above Pro.
 */
export type Tier = "free" | "go" | "pro" | "exclusive";

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  go: 1,
  pro: 2,
  exclusive: 3,
};

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  go: "Go",
  pro: "Pro",
  exclusive: "Exclusive",
};
