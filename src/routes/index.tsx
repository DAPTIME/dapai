import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Sparkles } from "lucide-react";

import { AdBanner } from "@/components/ads/ad-banner";
import {
  GAME_CATALOG,
  GAME_CATEGORIES,
  topGames,
  type GameCategory,
} from "@/lib/game-catalog";
import { useSiteConfig } from "@/lib/site-config";
import { GAME_FLAGS } from "@/lib/feature-guard";
import logo from "@/assets/logo.png.asset.json";

const HOME_DESCRIPTION =
  "DAP Games — play free browser games instantly: 2048, Snake, Brick Breaker, Flappy, River Crosser and DAP Track, our 3D time-trial racer with a track editor. No download.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DAP Games — Play Free Online Games" },
      { name: "description", content: HOME_DESCRIPTION },
      {
        name: "keywords",
        content: "free online games, browser games, DAP Games, DAP Track, 2048, snake, arcade",
      },
      { property: "og:title", content: "DAP Games — Play Free Online Games" },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dapgames.lovable.app/" },
      { property: "og:image", content: "https://dapgames.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "DAP Games — Play Free Online Games" },
      { name: "twitter:description", content: HOME_DESCRIPTION },
      { name: "twitter:image", content: "https://dapgames.lovable.app/og-image.png" },
    ],
    links: [
      { rel: "canonical", href: "https://dapgames.lovable.app/" },
      { rel: "preload", as: "image", href: logo.url, fetchPriority: "high" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "DAP Games",
          description: HOME_DESCRIPTION,
          url: "https://dapgames.lovable.app/",
          isPartOf: { "@type": "WebSite", name: "DAP Games", url: "https://dapgames.lovable.app" },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: GAME_CATALOG.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: g.title,
              url: `https://dapgames.lovable.app${g.route}`,
            })),
          },
        }),
      },
    ],
  }),
  component: Home,
});

const TILE_BG = [
  "from-amber-500/25 to-orange-600/10",
  "from-emerald-500/25 to-teal-600/10",
  "from-sky-500/25 to-indigo-600/10",
  "from-fuchsia-500/25 to-purple-600/10",
  "from-rose-500/25 to-red-600/10",
  "from-lime-500/25 to-green-600/10",
];

function GameTile({
  index,
  game,
  size = "sm",
  off,
}: {
  index: number;
  game: (typeof GAME_CATALOG)[number];
  size?: "sm" | "lg";
  off: boolean;
}) {
  const body = (
    <>
      <div
        className={`flex flex-1 items-center justify-center bg-gradient-to-br ${
          TILE_BG[index % TILE_BG.length]
        }`}
      >
        <span
          aria-hidden
          className={`${size === "lg" ? "text-6xl sm:text-7xl" : "text-4xl"} transition-transform duration-300 group-hover:scale-115`}
        >
          {game.emoji}
        </span>
      </div>
      <div className="p-2.5">
        <div className="truncate text-sm font-semibold text-foreground">{game.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {off ? "Under maintenance" : game.description}
        </div>
      </div>
    </>
  );

  const shell = `group flex ${
    size === "lg" ? "aspect-[4/3] sm:col-span-2 sm:row-span-2" : "aspect-[4/5]"
  } flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-all`;

  if (off) {
    return (
      <div className={`${shell} cursor-not-allowed opacity-40 grayscale`} aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link
      to={game.route}
      className={`${shell} hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl`}
    >
      {body}
    </Link>
  );
}

function Home() {
  const siteConfig = useSiteConfig();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GameCategory | "all">("all");

  const isOff = (route: string) => {
    const flag = GAME_FLAGS[route as keyof typeof GAME_FLAGS];
    return flag ? siteConfig.flags[flag] === false : false;
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAME_CATALOG.filter((g) => {
      if (category !== "all" && g.category !== category) return false;
      if (!q) return true;
      return (
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.tags.some((t) => t.includes(q))
      );
    }).sort((a, b) => b.popularity - a.popularity);
  }, [query, category]);

  const searching = query.trim().length > 0 || category !== "all";
  const featured = topGames(GAME_CATALOG.length);
  const usedCategories = GAME_CATEGORIES.filter(
    (c) => c.value === "all" || GAME_CATALOG.some((g) => g.category === c.value),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5">
      <AdBanner placement="top" />

      <header className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <img src={logo.url} alt="" width={36} height={36} className="h-9 w-9 rounded-lg object-contain" />
          <span
            style={{
              backgroundImage: "var(--gradient-text)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Play free games
          </span>
        </h1>
        <label className="relative block max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games"
            aria-label="Search games"
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none transition-colors focus:border-primary"
          />
        </label>
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {usedCategories.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                category === c.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </nav>
      </header>

      <section aria-label={searching ? "Search results" : "All games"}>
        {searching && (
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            {results.length} {results.length === 1 ? "game" : "games"}
          </h2>
        )}
        {results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No games match that search yet.
          </p>
        ) : (
          <div className="grid auto-rows-auto grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {(searching ? results : featured).map((g, i) => (
              <GameTile
                key={g.slug}
                index={i}
                game={g}
                size={!searching && i === 0 ? "lg" : "sm"}
                off={isOff(g.route)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/games/daptrack/browse"
          className="rounded-2xl border border-border bg-card/50 p-4 transition-colors hover:border-primary/60"
        >
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Community DAP Track levels
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Race tracks built and shared by other players.
          </p>
        </Link>
        <Link
          to="/games/daptrack/editor"
          className="rounded-2xl border border-border bg-card/50 p-4 transition-colors hover:border-primary/60"
        >
          <div className="font-semibold">Build your own track</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the DAP Track editor, publish a level, share the link.
          </p>
        </Link>
      </section>

      <AdBanner placement="bottom" />
    </div>
  );
}
