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
    tagline: "Full arcade access, with ads",
    benefits: [
      "Every game in DAP Games",
      "Save your leaderboard times and track records",
      "Light, dark and Liquid Glass themes",
    ],
  },
  {
    id: "go",
    name: "Go",
    tagline: "Fewer ads, more room to build",
    benefits: [
      "Everything in Free",
      "Build and publish more DAP Track levels",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Ad-free, the way it should be",
    benefits: [
      "Everything in Go",
      "No ads, anywhere on the site",
      "Higher DAP Track publishing quota",
      "Car customisation in DAP Track",
    ],
    highlight: true,
  },
  {
    id: "exclusive",
    name: "Exclusive",
    benefits: [
      "Everything in Pro",
      "Unlimited DAP Track levels",
      "First look at unreleased games",
    ],
  },
];

export const SUPPORT_EMAIL = "dapai.support@gmail.com";
export const LINKTREE_URL = "https://linktr.ee/DAPTIME";
