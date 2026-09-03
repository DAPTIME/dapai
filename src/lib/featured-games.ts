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
};

export const FEATURED_GAMES: FeaturedGame[] = [
  {
    slug: "mr-racer-car-racing-game",
    title: "MR RACER — Car Racing",
    subtitle: "3D racing",
    thumb:
      "https://img.gamepix.com/games/mr-racer-car-racing-game/cover/mr-racer-car-racing-game.png?w=320",
    badge: "Top game",
  },
  {
    slug: "moto-x3m-spooky-land",
    title: "Moto X3M: Spooky Land",
    subtitle: "Time-trial racing",
    thumb:
      "https://img.gamepix.com/games/moto-x3m-spooky-land/cover/moto-x3m-spooky-land.png?w=320",
    badge: "Featured",
  },
  {
    slug: "bmg-crashday-2025",
    title: "BMG! CrashDay 2025",
    subtitle: "Stunt driving",
    thumb: "https://img.gamepix.com/games/bmg-crashday-2025/cover/bmg-crashday-2025.png?w=320",
    badge: "Featured",
  },
  {
    slug: "endless-car-chase",
    title: "Endless Car Chase",
    subtitle: "Arcade racing",
    thumb: "https://img.gamepix.com/games/endless-car-chase/cover/endless-car-chase.png?w=320",
  },
];
