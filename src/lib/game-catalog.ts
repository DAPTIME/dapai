/**
 * Single source of truth for the arcade library. The browse page
 * (`/games`), the top-games rail and per-game maintenance flags all read
 * from this list, so every playable game must be registered here.
 */

export type GameCategory =
  | "arcade"
  | "puzzle"
  | "racing"
  | "action"
  | "board"
  | "word"
  | "memory"
  | "sports"
  | "casual";

export type CatalogGame = {
  /** Stable id / URL slug, e.g. "snake". */
  slug: string;
  /** Full route path, e.g. "/games/snake". */
  route: string;
  title: string;
  description: string;
  emoji: string;
  category: GameCategory;
  tags: string[];
  /** Higher = ranks higher in "Top games". */
  popularity: number;
  featured?: boolean;
};

export const GAME_CATALOG: CatalogGame[] = [
  {
    slug: "2048",
    route: "/games/2048",
    title: "2048",
    description: "Slide, merge, chase the 2048 tile.",
    emoji: "🟨",
    category: "puzzle",
    tags: ["numbers", "sliding", "single-player"],
    popularity: 98,
    featured: true,
  },
  {
    slug: "snake",
    route: "/games/snake",
    title: "Snake",
    description: "Classic snake — eat, grow, don't bite yourself.",
    emoji: "🐍",
    category: "arcade",
    tags: ["classic", "reflex"],
    popularity: 96,
    featured: true,
  },
  {
    slug: "daptrack",
    route: "/games/daptrack",
    title: "DAP Track",
    description: "3D low-poly time trials — checkpoints, ghosts, medals, editor.",
    emoji: "🏎️",
    category: "racing",
    tags: ["3d", "time-trial", "editor"],
    popularity: 95,
    featured: true,
  },
  {
    slug: "river",
    route: "/games/river",
    title: "River Crosser",
    description: "Hop cars and logs — don't drown.",
    emoji: "🐸",
    category: "arcade",
    tags: ["classic", "reflex"],
    popularity: 80,
  },
  {
    slug: "flappy",
    route: "/games/flappy",
    title: "Flappy",
    description: "Tap to flap between the pipes.",
    emoji: "🐤",
    category: "arcade",
    tags: ["one-button", "reflex"],
    popularity: 90,
    featured: true,
  },
  {
    slug: "breakout",
    route: "/games/breakout",
    title: "Brick Breaker",
    description: "Bounce, smash, clear the wall.",
    emoji: "🧱",
    category: "arcade",
    tags: ["ball", "paddle"],
    popularity: 88,
  },
];

export function gamesByCategory(category: GameCategory | "all"): CatalogGame[] {
  if (category === "all") return GAME_CATALOG;
  return GAME_CATALOG.filter((g) => g.category === category);
}

export function topGames(count = 8): CatalogGame[] {
  return [...GAME_CATALOG].sort((a, b) => b.popularity - a.popularity).slice(0, count);
}

export const GAME_CATEGORIES: { value: GameCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "arcade", label: "Arcade" },
  { value: "puzzle", label: "Puzzle" },
  { value: "racing", label: "Racing" },
  { value: "action", label: "Action" },
  { value: "board", label: "Board" },
  { value: "word", label: "Word" },
  { value: "memory", label: "Memory" },
  { value: "sports", label: "Sports" },
  { value: "casual", label: "Casual" },
];
