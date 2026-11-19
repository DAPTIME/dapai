import { FEATURED_GAMES } from "./featured-games";

type DiscoverableGame = { slug: string; category: string; score?: number };

export const DISCOVERY_SECTIONS = [
  { title: "Racing & stunts", categories: ["racing", "driving", "car", "bike", "dirt-bike"] },
  { title: "Action & multiplayer", categories: ["action", "io", "shooter", "first-person-shooter", "fighting", "parkour", "survival"] },
  { title: "Sports & arcade", categories: ["sports", "basketball", "football", "arcade", "ball", "runner"] },
];

const priority = new Map(FEATURED_GAMES.map((game, index) => [game.slug, index]));
const activeCategories = new Set(DISCOVERY_SECTIONS.flatMap((section) => section.categories));
const relaxedCategories = new Set(["farming", "dress-up", "makeup", "cooking", "baby", "beauty"]);

/** Editorial relevance comes first; provider quality is only a tie-breaker, not play-count data. */
export function rankDiscoveryGames<T extends DiscoverableGame>(games: T[]): T[] {
  const tier = (game: T) => priority.has(game.slug) ? 3 : activeCategories.has(game.category) ? 2 : relaxedCategories.has(game.category) ? 0 : 1;
  const seen = new Set<string>();
  return games.filter((game) => {
    if (seen.has(game.slug)) return false;
    seen.add(game.slug);
    return true;
  }).sort((a, b) => tier(b) - tier(a)
    || (priority.get(a.slug) ?? 999) - (priority.get(b.slug) ?? 999)
    || (b.score ?? 0) - (a.score ?? 0));
}