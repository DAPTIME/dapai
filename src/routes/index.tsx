import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { AdBanner } from "@/components/ads/ad-banner";
import { GAME_CATALOG } from "@/lib/game-catalog";
import { FEED_CATEGORIES } from "@/lib/feed-categories";
import { listFeedGames } from "@/lib/gamepix.functions";
import { useSiteConfig } from "@/lib/site-config";
import { GAME_FLAGS } from "@/lib/feature-guard";
import logo from "@/assets/logo.png.asset.json";

const HOME_DESCRIPTION =
  "DAP Games — thousands of free games you can play instantly in your browser: arcade, puzzle, racing, .io and shooters, plus DAP Track, our own 3D time-trial racer with a track editor.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DAP Games — Play Thousands of Free Online Games" },
      { name: "description", content: HOME_DESCRIPTION },
      {
        name: "keywords",
        content: "free online games, browser games, io games, DAP Games, DAP Track, 2048, snake",
      },
      { property: "og:title", content: "DAP Games — Play Thousands of Free Online Games" },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dapgames.lovable.app/" },
      { property: "og:image", content: "https://dapgames.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "DAP Games — Play Thousands of Free Online Games" },
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
          isPartOf: {
            "@type": "WebSite",
            name: "DAP Games",
            url: "https://dapgames.lovable.app",
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

type Tile = {
  key: string;
  to: string;
  title: string;
  subtitle: string;
  emoji?: string;
  thumb?: string;
  badge?: string;
  off?: boolean;
};

function GameTile({ tile, index }: { tile: Tile; index: number }) {
  const media = tile.thumb ? (
    <img
      src={tile.thumb}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  ) : (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${
        TILE_BG[index % TILE_BG.length]
      }`}
    >
      <span
        aria-hidden
        className="text-4xl transition-transform duration-300 group-hover:scale-110"
      >
        {tile.emoji ?? "🎮"}
      </span>
    </div>
  );

  const body = (
    <>
      <div className="relative flex-1 overflow-hidden">
        {media}
        {tile.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
            {tile.badge}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <div className="truncate text-sm font-semibold text-foreground">{tile.title}</div>
        <div className="truncate text-xs text-muted-foreground">{tile.subtitle}</div>
      </div>
    </>
  );

  const shell =
    "group flex aspect-[4/5] flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-all";

  if (tile.off) {
    return (
      <div className={`${shell} cursor-not-allowed opacity-40 grayscale`} aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link to={tile.to} className={`${shell} hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl`}>
      {body}
    </Link>
  );
}

function Home() {
  const siteConfig = useSiteConfig();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [pages, setPages] = useState(1);

  const fetchFeed = useServerFn(listFeedGames);
  const feedQueries = useQuery({
    queryKey: ["feed", category, pages],
    queryFn: async () => {
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          fetchFeed({ data: { page: i + 1, category: category === "all" ? null : category } }),
        ),
      );
      return {
        games: results.flatMap((r) => r.games),
        lastPage: results[results.length - 1]?.lastPage ?? 1,
      };
    },
    staleTime: 30 * 60 * 1000,
  });

  const originals: Tile[] = GAME_CATALOG.map((g) => {
    const flag = GAME_FLAGS[g.route];
    return {
      key: `own-${g.slug}`,
      to: g.route,
      title: g.title,
      subtitle: g.description,
      emoji: g.emoji,
      badge: "DAP",
      off: flag ? siteConfig.flags[flag] === false : false,
    };
  }).sort((a, b) => Number(a.off) - Number(b.off));

  const feedTiles: Tile[] = (feedQueries.data?.games ?? []).map((g) => ({
    key: `feed-${g.slug}`,
    to: `/play/${g.slug}`,
    title: g.title,
    subtitle: g.category.replace(/-/g, " "),
    thumb: g.thumb,
  }));

  const q = query.trim().toLowerCase();
  const tiles = useMemo(() => {
    const all = category === "all" ? [...originals, ...feedTiles] : feedTiles;
    if (!q) return all;
    return all.filter(
      (t) => t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q),
    );
  }, [originals, feedTiles, q, category]);

  const canLoadMore =
    !q && pages < (feedQueries.data?.lastPage ?? 1) && pages < 40 && !feedQueries.isFetching;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-4">
      <AdBanner placement="top" />

      <header className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <img
            src={logo.url}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg object-contain"
          />
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
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Categories">
          {FEED_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                setCategory(c.value);
                setPages(1);
              }}
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

      <section aria-label="Games">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {tiles.map((t, i) => (
            <GameTile key={t.key} tile={t} index={i} />
          ))}
          {feedQueries.isPending &&
            Array.from({ length: 10 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="aspect-[4/5] animate-pulse rounded-2xl border border-border bg-card/50"
              />
            ))}
        </div>

        {tiles.length === 0 && !feedQueries.isPending && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No games match that search.
          </p>
        )}

        {feedQueries.isError && (
          <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            The wider game library is unavailable right now — the DAP games above still work.
          </p>
        )}

        {canLoadMore && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setPages((p) => p + 1)}
              className="rounded-full border border-border px-6 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              Load more games
            </button>
          </div>
        )}
        {feedQueries.isFetching && !feedQueries.isPending && (
          <p className="mt-4 text-center text-xs text-muted-foreground">Loading more games…</p>
        )}
      </section>

      <AdBanner placement="bottom" />
    </div>
  );
}
