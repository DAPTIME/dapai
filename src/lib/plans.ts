/**
 * Plan catalogue used by the upgrade screen. Benefits only — no prices.
 */
export type PlanId = "free" | "go" | "pro" | "exclusive";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  benefits: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Everything you need to get started",
    benefits: [
      "DAP AI 4 Lite for everyday questions",
      "Unlimited chats and chat history",
      "Full DAP Arcade access",
      "Save your game records and leaderboard times",
      "Light, dark and Liquid Glass themes",
    ],
  },
  {
    id: "go",
    name: "Go",
    tagline: "For people who use DAP AI every day",
    benefits: [
      "Everything in Free",
      "Much higher daily message limits",
      "Faster replies during busy hours",
      "Beta features as they land",
      "Longer memory across your chats",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "The full DAP AI 4 experience",
    benefits: [
      "Everything in Go",
      "DAP AI 4 Pro — the smartest DAP model",
      "Build your own Custom AI assistants",
      "Priority access when the site is busy",
      "Deeper reasoning for study, coding and writing",
      "Early access to new games and tools",
    ],
    highlight: true,
  },
  {
    id: "exclusive",
    name: "Exclusive",
    tagline: "For the inner circle",
    benefits: [
      "Everything in Pro",
      "Highest limits on every model",
      "First look at unreleased features",
      "Direct line to the DAP AI team",
      "Your name on the beta testers page",
      "Requests you make get built first",
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
