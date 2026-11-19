import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { AdBanner } from "@/components/ads/ad-banner";
import { FEATURED_GAMES } from "@/lib/featured-games";
import { DISCOVERY_SECTIONS, rankDiscoveryGames } from "@/lib/game-discovery";
import { FEED_CATEGORIES } from "@/lib/feed-categories";
import { listFeedGames, searchFeed } from "@/lib/gamepix.functions";
import { relayed, useRelay } from "@/lib/relay";

import logo from "@/assets/logo.png.asset.json";

const HOME_DESCRIPTION =
  "DAP Games — thousands of free games you can play instantly in your browser: arcade, puzzle, racing, .io and shooters, all in one place.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DAP Games — Play Thousands of Free Online Games" },
      { name: "description", content: HOME_DESCRIPTION },
      {
        name: "keywords",
        content: "free online games, browser games, io games, DAP Games, puzzle games, racing games",
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
  /** Feed slug — tiles always navigate to the /play/$slug route. */
  slug: string;
  title: string;
  subtitle: string;
  emoji?: string;
  thumb?: string;
  badge?: string;
  off?: boolean;
};

function GameTile({ tile, index, relay }: { tile: Tile; index: number; relay: boolean }) {
  const media = tile.thumb ? (
    <img
      src={relay ? relayed(tile.thumb) : tile.thumb}
      alt=""
      loading="lazy"
      decoding="async"
      onError={(e) => {
        // Per-image safety net: a network that filters the image host fails
        // here even when the session probe said things were fine.
        const img = e.currentTarget;
        const direct = tile.thumb;
        if (!direct) return;
        if (!img.dataset["relayed"]) {
          img.dataset["relayed"] = "1";
          img.src = relayed(direct);
        }
      }}
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
    <Link
      to="/play/$slug"
      params={{ slug: tile.slug }}
      className={`${shell} hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl`}
    >
      {body}
    </Link>
  );
}

function GameRow({ title, tiles, relay }: { title: string; tiles: Tile[]; relay: boolean }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {tiles.map((t, i) => (
          <GameTile key={t.key} tile={t} index={i} relay={relay} />
        ))}
      </div>
    </section>
  );
}

function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  // True when this network blocks the provider: pictures come through our own
  // address instead.
  const relay = useRelay();


  // Debounce so typing doesn't fire a search request per keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const q = debounced.toLowerCase();
  const searching = q.length >= 2;

  const fetchFeed = useServerFn(listFeedGames);
  const runSearch = useServerFn(searchFeed);

  // Browsing: append one page at a time and keep the pages already on screen.
  const feed = useInfiniteQuery({
    queryKey: ["feed", category],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchFeed({
        data: { page: pageParam, category: category === "all" ? null : category },
      }),
    getNextPageParam: (last) =>
      last.page < Math.min(last.lastPage, 40) ? last.page + 1 : undefined,
    staleTime: 30 * 60 * 1000,
    enabled: !searching,
  });

  // Searching: ask the server, which looks across the whole indexed library.
  const search = useQuery({
    queryKey: ["feed-search", q],
    queryFn: () => runSearch({ data: { term: q } }),
    staleTime: 30 * 60 * 1000,
    enabled: searching,
  });

  const feedGames = searching
    ? (search.data?.games ?? [])
    : (feed.data?.pages.flatMap((p) => p.games) ?? []);

  // Editorial priorities, not invented player-count rankings.
  const ranked = searching
    ? feedGames
    : rankDiscoveryGames(feedGames);
  const feedTiles: Tile[] = ranked.map((g) => ({
    key: `feed-${g.slug}`,
    slug: g.slug,
    title: g.title,
    subtitle: g.category.replace(/-/g, " "),
    thumb: g.thumb,
  }));

  // Pinned picks lead the grid while browsing, and guarantee something is
  // playable even if the live feed is down.
  const tiles = useMemo(() => {
    if (searching) {
      const term = q;
      const matches = FEATURED_GAMES.filter((g) => g.title.toLowerCase().includes(term));
      const pinned = matches.map((g) => ({ key: `pin-${g.slug}`, ...g }));
      const seen = new Set(pinned.map((t) => t.slug));
      return [...pinned, ...feedTiles.filter((t) => !seen.has(t.slug))];
    }
    const seen = new Set(FEATURED_GAMES.filter((game) => category === "all" || game.category === category).map((t) => t.slug));
    return feedTiles.filter((t) => !seen.has(t.slug));
  }, [feedTiles, searching, q, category]);

  const browsingAll = !searching && category === "all";
  const featuredTiles: Tile[] = FEATURED_GAMES.filter((game) => category === "all" || game.category === category).map((g) => ({ key: `pin-${g.slug}`, ...g }));
  const discoveryRows = browsingAll ? DISCOVERY_SECTIONS.map((section) => ({
    title: section.title,
    tiles: tiles.filter((tile) => {
      const game = ranked.find((game) => game.slug === tile.slug);
      return game && section.categories.includes(game.category);
    }).slice(0, 5),
  })) : [];
  const groupedSlugs = new Set(discoveryRows.flatMap((row) => row.tiles.map((tile) => tile.slug)));
  const rest = tiles.filter((tile) => !groupedSlugs.has(tile.slug));
  const restLabel = searching
    ? "Search results"
    : browsingAll
      ? "More games"
      : `${FEED_CATEGORIES.find((c) => c.value === category)?.label ?? ""} games`;


  const isPending = searching ? search.isPending : feed.isPending;
  const isError = searching ? search.isError : feed.isError;
  const isFetchingMore = !searching && feed.isFetchingNextPage;
  const canLoadMore = !searching && feed.hasNextPage && !feed.isFetchingNextPage;


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

      {!searching && featuredTiles.length > 0 && (
        <GameRow title="Top picks" tiles={featuredTiles} relay={relay} />
      )}
      {discoveryRows.filter((row) => row.tiles.length > 0).map((row) => (
        <GameRow key={row.title} title={row.title} tiles={row.tiles} relay={relay} />
      ))}

      <section aria-label="Games">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">{restLabel}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {rest.map((t, i) => (
            <GameTile key={t.key} tile={t} index={i} relay={relay} />
          ))}
          {(isPending || isFetchingMore) &&
            Array.from({ length: 10 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="aspect-[4/5] animate-pulse rounded-2xl border border-border bg-card/50"
              />
            ))}
        </div>

        {tiles.length === 0 && !isPending && searching && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No games match that search. Clear the search box to browse the full library.
          </p>
        )}

        {isError && (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <p>
              We couldn&apos;t load the full game library just now. The featured games above are
              still playable — try again for the rest.
            </p>
            <button
              type="button"
              onClick={() => void (searching ? search.refetch() : feed.refetch())}
              className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Try again
            </button>
          </div>
        )}

        {canLoadMore && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void feed.fetchNextPage()}
              className="rounded-full border border-border px-6 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              Load more games
            </button>
          </div>
        )}
        {isFetchingMore && (
          <p className="mt-4 text-center text-xs text-muted-foreground">Loading more games…</p>
        )}
      </section>

      <AdBanner placement="bottom" />
    </div>
  );
}
