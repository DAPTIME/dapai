import { describe, expect, it } from "vitest";

import {
  COST_BANDS,
  TIER_LIMITS,
  costOfPrompt,
  maxCostFor,
} from "@/lib/usage-limits";
import type { Tier } from "@/lib/tier-rank";

/**
 * The cost curve is the one piece of the quota system a person feels
 * directly, and it is easy to break by editing a band edge: the bands are
 * percentages of each tier's OWN prompt cap, so a change to the cap silently
 * moves every price. These lock the shape in place.
 */
const CHARGED: Tier[] = ["free", "go", "pro"];

describe("cost bands", () => {
  it("rises by exactly 0.5 per band and ends at the documented maximum", () => {
    const expectedMax: Record<string, number> = { free: 3.5, go: 4.5, pro: 5.5 };
    for (const tier of CHARGED) {
      const costs = COST_BANDS[tier].map(([, c]) => c);
      for (let i = 1; i < costs.length; i++) {
        expect(costs[i]! - costs[i - 1]!).toBeCloseTo(0.5, 6);
      }
      expect(maxCostFor(tier)).toBe(expectedMax[tier]);
      // Last band must close at the cap, or a full-length prompt falls off
      // the end of the table.
      expect(COST_BANDS[tier].at(-1)![0]).toBe(100);
    }
  });

  it("charges the first band for a tiny prompt and the last for a full one", () => {
    for (const tier of CHARGED) {
      const cap = TIER_LIMITS[tier].maxPromptTokens;
      expect(costOfPrompt(tier, 1)).toBe(COST_BANDS[tier][0]![1]);
      expect(costOfPrompt(tier, 0)).toBe(COST_BANDS[tier][0]![1]);
      expect(costOfPrompt(tier, cap)).toBe(maxCostFor(tier));
    }
  });

  it("rejects anything over the tier's cap rather than charging the top band", () => {
    for (const tier of CHARGED) {
      const cap = TIER_LIMITS[tier].maxPromptTokens;
      expect(costOfPrompt(tier, cap + 1)).toBeNull();
      expect(costOfPrompt(tier, cap * 10)).toBeNull();
    }
  });

  it("charges a higher tier less for the identical prompt", () => {
    // 900 tokens is most of Free's allowance and a small slice of Pro's.
    const free = costOfPrompt("free", 900)!;
    const go = costOfPrompt("go", 900)!;
    const pro = costOfPrompt("pro", 900)!;
    // Never cheaper on a smaller plan, and strictly cheaper at the extremes
    // (band edges can land two adjacent tiers on the same figure).
    expect(free).toBeGreaterThanOrEqual(go);
    expect(go).toBeGreaterThanOrEqual(pro);
    expect(free).toBeGreaterThan(pro);
  });

  it("never charges exclusive, at any prompt length", () => {
    expect(costOfPrompt("exclusive", 1)).toBe(0);
    expect(costOfPrompt("exclusive", TIER_LIMITS.exclusive.maxPromptTokens)).toBe(0);
    // Still capped: the orchestrator has a real context window.
    expect(costOfPrompt("exclusive", TIER_LIMITS.exclusive.maxPromptTokens + 1)).toBeNull();
  });

  it("moves up a band as the prompt grows, monotonically", () => {
    for (const tier of CHARGED) {
      const cap = TIER_LIMITS[tier].maxPromptTokens;
      let last = 0;
      for (let t = 1; t <= cap; t += Math.floor(cap / 40)) {
        const c = costOfPrompt(tier, t)!;
        expect(c).toBeGreaterThanOrEqual(last);
        last = c;
      }
    }
  });
});
