/**
 * Hand-picked games pinned to the top of the home grid.
 *
 * These are always rendered — even when the live game feed is unreachable —
 * so the home page can never end up as an empty grid with nothing to play.
 *
 * Note on PolyTrack: the real PolyTrack by Kodub is freeware, not open
 * source, and its itch.io player URLs are short-lived signed links, so it
 * cannot be legally or technically embedded here. The pinned racers below
 * are licensed, embeddable low-poly time-trial style racing games.
 */

export type FeaturedGame = {
  slug: string;
  title: string;
  subtitle: string;
  thumb: string;
  badge?: string;
  category?: string;
};

export const FEATURED_GAMES: FeaturedGame[] = [
  {
    slug: "moto-x3m-spooky-land",
    title: "Moto X3M: Spooky Land",
    subtitle: "Time-trial racing",
    category: "racing",
    thumb: "https://img.gamepix.com/games/moto-x3m-spooky-land/cover/moto-x3m-spooky-land.png?w=320",
  },
  {
    slug: "basketball-stars",
    title: "Basketball Stars",
    subtitle: "Basketball",
    category: "sports",
    thumb: "https://img.gamepix.com/games/basketball-stars/cover/basketball-stars.png?w=320",
  },
  {
    slug: "slope-racing-3d",
    title: "Slope Racing 3D",
    subtitle: "Arcade · reflexes",
    category: "ball",
    thumb: "https://img.gamepix.com/games/slope-racing-3d/cover/slope-racing-3d.png?w=320",
  },
  {
    slug: "mr-racer-car-racing-game",
    title: "MR RACER — Car Racing",
    subtitle: "3D racing",
    category: "racing",
    thumb:
      "https://img.gamepix.com/games/mr-racer-car-racing-game/cover/mr-racer-car-racing-game.png?w=320",
  },
  {
    slug: "ninja-parkour-multiplayer",
    title: "Ninja Parkour Multiplayer",
    subtitle: "Multiplayer parkour",
    category: "parkour",
    thumb: "https://img.gamepix.com/games/ninja-parkour-multiplayer/cover/ninja-parkour-multiplayer.png?w=320",
  },
  {
    slug: "bmg-crashday-2025",
    title: "BMG! CrashDay 2025",
    subtitle: "Stunt driving",
    category: "racing",
    thumb: "https://img.gamepix.com/games/bmg-crashday-2025/cover/bmg-crashday-2025.png?w=320",
  },
  {
    slug: "endless-car-chase",
    title: "Endless Car Chase",
    subtitle: "Arcade racing",
    category: "racing",
    thumb: "https://img.gamepix.com/games/endless-car-chase/cover/endless-car-chase.png?w=320",
  },
  {
    slug: "stickman-warriors-1",
    title: "Stickman Warriors",
    subtitle: "Fighting",
    category: "fighting",
    thumb: "https://img.gamepix.com/games/stickman-warriors-1/cover/stickman-warriors-1.png?w=320",
  },
  {
    slug: "worm-hunt-snake-game-io-zone",
    title: "Worm Hunt",
    subtitle: ".io survival",
    category: "io",
    thumb: "https://img.gamepix.com/games/worm-hunt-snake-game-io-zone/cover/worm-hunt-snake-game-io-zone.png?w=320",
  },
  {
    slug: "football-masters",
    title: "Football Masters",
    subtitle: "Football",
    category: "sports",
    thumb: "https://img.gamepix.com/games/football-masters/cover/football-masters.png?w=320",
  },
];
