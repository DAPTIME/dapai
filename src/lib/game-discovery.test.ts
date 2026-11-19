import { describe, expect, it } from "vitest";
import { rankDiscoveryGames } from "./game-discovery";

describe("homepage editorial ranking", () => {
  it("puts Moto X3M ahead of Garden Master even with a lower provider score", () => {
    const result = rankDiscoveryGames([
      { slug: "garden-master", category: "farming", score: 1 },
      { slug: "moto-x3m-spooky-land", category: "racing", score: 0.1 },
    ]);
    expect(result.map((game) => game.slug)).toEqual(["moto-x3m-spooky-land", "garden-master"]);
  });
  it("prioritizes action over farming without hiding either game", () => {
    expect(rankDiscoveryGames([
      { slug: "garden-master", category: "farming", score: 1 },
      { slug: "action-game", category: "action", score: 0 },
    ]).map((game) => game.slug)).toEqual(["action-game", "garden-master"]);
  });
  it("deduplicates games across loaded pages", () => {
    expect(rankDiscoveryGames([
      { slug: "basketball-stars", category: "sports" },
      { slug: "basketball-stars", category: "sports" },
    ])).toHaveLength(1);
  });
});