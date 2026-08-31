export type PlanId = "free" | "go" | "pro" | "exclusive";

export interface Plan {
  id: PlanId;
  name: string;
  tagline?: string;
  benefits: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Full game library, with ads",
    benefits: [
      "Every game in DAP Games",
      "Light, dark and Liquid Glass themes",
    ],
  },
  {
    id: "go",
    name: "Go",
    tagline: "Fewer ads",
    benefits: [
      "Everything in Free",
      "Fewer ads while you play",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Ad-free, the way it should be",
    benefits: [
      "Everything in Go",
      "No ads, anywhere on the site",
      "Play in fullscreen without banner ads",
    ],
    highlight: true,
  },
  {
    id: "exclusive",
    name: "Exclusive",
    benefits: [
      "Everything in Pro",
      "First look at unreleased games",
    ],
  },
];

export const SUPPORT_EMAIL = "dapai.support@gmail.com";
export const LINKTREE_URL = "https://linktr.ee/DAPTIME";
