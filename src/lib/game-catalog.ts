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
  {
    slug: "tetris",
    route: "/games/tetris",
    title: "Block Stacker",
    description: "Rotate and drop falling blocks to clear lines.",
    emoji: "🧩",
    category: "puzzle",
    tags: ["falling-blocks", "classic"],
    popularity: 94,
    featured: true,
  },
  {
    slug: "minesweeper",
    route: "/games/minesweeper",
    title: "Minesweeper",
    description: "Clear the board without triggering a mine.",
    emoji: "💣",
    category: "puzzle",
    tags: ["logic", "classic"],
    popularity: 85,
  },
  {
    slug: "memory",
    route: "/games/memory",
    title: "Memory Match",
    description: "Flip cards and match every pair from memory.",
    emoji: "🧠",
    category: "memory",
    tags: ["cards", "brain"],
    popularity: 82,
  },
  {
    slug: "simon",
    route: "/games/simon",
    title: "Simon Says",
    description: "Watch the pattern, then repeat it back — one step longer each round.",
    emoji: "🔴",
    category: "memory",
    tags: ["pattern", "sound"],
    popularity: 75,
  },
  {
    slug: "tictactoe",
    route: "/games/tictactoe",
    title: "Tic-Tac-Toe",
    description: "Classic X's and O's against a smart AI.",
    emoji: "❌",
    category: "board",
    tags: ["ai", "two-player-feel"],
    popularity: 78,
  },
  {
    slug: "connect4",
    route: "/games/connect4",
    title: "Connect Four",
    description: "Drop discs and connect four before the AI does.",
    emoji: "🔵",
    category: "board",
    tags: ["ai", "strategy"],
    popularity: 79,
  },
  {
    slug: "reaction",
    route: "/games/reaction",
    title: "Reaction Test",
    description: "Tap the instant it turns green — how fast are your reflexes?",
    emoji: "⚡",
    category: "casual",
    tags: ["reflex", "solo"],
    popularity: 70,
  },
  {
    slug: "whackamole",
    route: "/games/whackamole",
    title: "Whack-a-Mole",
    description: "Bop moles before they duck back down. Beat the clock.",
    emoji: "🔨",
    category: "casual",
    tags: ["reflex", "timed"],
    popularity: 76,
  },
  {
    slug: "pong",
    route: "/games/pong",
    title: "Pong",
    description: "The original paddle game — first to 7 wins against the AI.",
    emoji: "🏓",
    category: "sports",
    tags: ["classic", "ai"],
    popularity: 74,
  },
  {
    slug: "spaceshooter",
    route: "/games/spaceshooter",
    title: "Space Shooter",
    description: "Blast waves of enemy ships and dodge incoming fire.",
    emoji: "🚀",
    category: "action",
    tags: ["shooter", "waves"],
    popularity: 84,
    featured: true,
  },
  {
    slug: "higherlower",
    route: "/games/higherlower",
    title: "Higher or Lower",
    description: "Guess if the next card is higher or lower. Build the streak.",
    emoji: "🃏",
    category: "casual",
    tags: ["cards", "streak"],
    popularity: 65,
  },
  {
    slug: "wordscramble",
    route: "/games/wordscramble",
    title: "Word Scramble",
    description: "Unscramble the letters to find the hidden word before time runs out.",
    emoji: "🔤",
    category: "word",
    tags: ["vocabulary", "timed"],
    popularity: 68,
  },
  {
    slug: "hangman",
    route: "/games/hangman",
    title: "Hangman",
    description: "Guess the word one letter at a time before you run out of tries.",
    emoji: "🪢",
    category: "word",
    tags: ["vocabulary", "classic"],
    popularity: 69,
  },
  {
    slug: "fifteen",
    route: "/games/fifteen",
    title: "15 Puzzle",
    description: "Slide numbered tiles into order around the one empty slot.",
    emoji: "🔢",
    category: "puzzle",
    tags: ["sliding", "classic"],
    popularity: 62,
  },
  {
    slug: "lightsout",
    route: "/games/lightsout",
    title: "Lights Out",
    description: "Toggle tiles to switch off every light on the grid.",
    emoji: "💡",
    category: "puzzle",
    tags: ["logic", "grid"],
    popularity: 60,
  },
  {
    slug: "maze",
    route: "/games/maze",
    title: "Maze Runner",
    description: "Navigate a freshly generated maze from start to exit.",
    emoji: "🧭",
    category: "puzzle",
    tags: ["procedural", "navigation"],
    popularity: 66,
  },
  {
    slug: "typing",
    route: "/games/typing",
    title: "Typing Race",
    description: "Type the falling words before they hit the bottom.",
    emoji: "⌨️",
    category: "casual",
    tags: ["typing", "speed"],
    popularity: 71,
  },
  {
    slug: "colormatch",
    route: "/games/colormatch",
    title: "Color Match",
    description: "Say if the word matches its ink color — faster than you'd think, harder too.",
    emoji: "🎨",
    category: "casual",
    tags: ["stroop", "reflex"],
    popularity: 63,
  },
  {
    slug: "rps",
    route: "/games/rps",
    title: "Rock Paper Scissors",
    description: "Beat an adaptive AI and build the longest win streak.",
    emoji: "✂️",
    category: "casual",
    tags: ["ai", "streak"],
    popularity: 64,
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
