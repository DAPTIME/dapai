/**
 * Plan catalogue used by the upgrade screen and the plans page.
 *
 * Benefits only — there are no prices here, because there is no self-serve
 * checkout: a tier lives on the profile row and is set by an admin.
 *
 * The hard numbers are NOT duplicated here. Anything countable — usage
 * tokens, input and output caps, image quotas, web search, memory — comes
 * from TIER_LIMITS in usage-limits.ts, so the plans page cannot advertise
 * an allowance the enforcement layer disagrees with.
 */
export type PlanId = "free" | "go" | "pro" | "exclusive";

export interface Plan {
  id: PlanId;
  name: string;
  /**
   * Optional — Exclusive has none. Renderers must omit the element
   * entirely when it is absent rather than render an empty one, or the
   * card gains a blank row.
   */
  tagline?: string;
  benefits: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "DAP AI 4 Lite",
    tagline: "Basic, gets work done — good deal",
    benefits: [
      "DAP AI 4 Lite for everyday questions",
      "Full DAP Arcade access",
      "Save your game records and leaderboard times",
      "Light, dark and Liquid Glass themes",
    ],
  },
  {
    id: "go",
    name: "DAP AI 4 Pro Lite",
    tagline: "Starting to do real work — smart, great deal",
    benefits: [
      "Everything in DAP AI 4 Lite",
      "DAP AI 4 Pro Lite — quick, and sharper",
      "Web search and memory across your chats",
      "Generate images",
      "Beta features as they land",
    ],
  },
  {
    id: "pro",
    name: "DAP AI 4 Pro",
    tagline: "The best tier: best models, very good usage limits",
    benefits: [
      "Everything in DAP AI 4 Pro Lite",
      "DAP AI 4 Pro — the smartest DAP model",
      "Build your own Custom AI assistants",
      "Priority in the queue when the site is busy",
      "Longer prompts, longer answers, more images",
    ],
  },
  {
    id: "exclusive",
    name: "DAP AI 4 Pro",
    benefits: [
      "Everything in DAP AI 4 Pro",
      "No usage limits at all",
      "Unlimited images",
      "First look at unreleased features",
    ],
  },
];

export const SUPPORT_EMAIL = "dapai.support@gmail.com";
/**
 * Every outbound "reach us" link on the site. It read "https://n.ee/daptime"
 * — the host had lost its "linktr" — so the upgrade dialog's link went
 * nowhere. One constant now, used by the footer too, so the two cannot
 * drift again.
 */
export const LINKTREE_URL = "https://linktr.ee/DAPTIME";
