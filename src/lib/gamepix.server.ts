/**
 * GamePix free JSON feed — thousands of licensed, embeddable HTML5 games.
 * We only ever proxy the feed server-side so the publisher id stays in one
 * place and responses can be cached.
 */

export type FeedGame = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  thumb: string;
  /** Embeddable iframe URL. */
  url: string;
  /** Direct URL of the game's own files, without the provider launcher. */
  buildUrl?: string;
  width: number;
  height: number;
  /** Provider popularity/quality score, 0–1 (higher = more played). */
  score?: number;
};

export type FeedPage = {
  games: FeedGame[];
  page: number;
  lastPage: number;
};

const FEED = "https://feeds.gamepix.com/v2/json";
const PAGE_SIZE = 48;

/** Publisher id. `1` is GamePix's public demo id and works out of the box. */
function sid(): string {
  return process.env["GAMEPIX_SID"] || "1";
}

type RawItem = {
  id?: string;
  title?: string;
  namespace?: string;
  description?: string;
  category?: string;
  banner_image?: string;
  image?: string;
  url?: string;
  width?: number;
  height?: number;
  quality_score?: number;
};

function normalize(item: RawItem): FeedGame | null {
  if (!item.namespace || !item.title || !item.url) return null;
  return {
    id: item.id ?? item.namespace,
    slug: item.namespace,
    title: item.title,
    description: item.description?.split(/(?<=\.)\s/)[0]?.slice(0, 160) ?? "",
    category: item.category ?? "casual",
    thumb: item.banner_image || item.image || "",
    url: item.url,
    width: item.width ?? 800,
    height: item.height ?? 600,
    score: typeof item.quality_score === "number" ? item.quality_score : undefined,
  };
}

function lastPageFrom(url: unknown): number {
  if (typeof url !== "string") return 1;
  const m = /[?&]page=(\d+)/.exec(url);
  return m ? Number(m[1]) : 1;
}

export async function fetchFeedPage(opts: {
  page: number;
  category?: string | null;
}): Promise<FeedPage> {
  const params = new URLSearchParams({
    sid: sid(),
    pagination: String(PAGE_SIZE),
    page: String(Math.max(1, Math.floor(opts.page || 1))),
    order: "quality",
  });
  if (opts.category && opts.category !== "all") params.set("category", opts.category);

  const res = await fetch(`${FEED}?${params.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Game feed request failed [${res.status}]: ${await res.text()}`);
  }
  const body = (await res.json()) as { items?: RawItem[]; last_page_url?: string };
  const games = (body.items ?? []).map(normalize).filter((g): g is FeedGame => g !== null);
  return { games, page: Number(params.get("page")), lastPage: lastPageFrom(body.last_page_url) };
}

/**
 * The feed has no search endpoint, so we build a searchable index by pulling
 * the first few large pages once and keeping them in memory for a while.
 */
const INDEX_PAGES = 8;
const INDEX_PAGE_SIZE = 96;
const INDEX_TTL_MS = 30 * 60 * 1000;
const SEARCH_LIMIT = 96;

let indexCache: { at: number; games: FeedGame[] } | null = null;
let indexInFlight: Promise<FeedGame[]> | null = null;

async function fetchIndexPage(page: number): Promise<FeedGame[]> {
  const params = new URLSearchParams({
    sid: sid(),
    pagination: String(INDEX_PAGE_SIZE),
    page: String(page),
    order: "quality",
  });
  const res = await fetch(`${FEED}?${params.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { items?: RawItem[] };
  return (body.items ?? []).map(normalize).filter((g): g is FeedGame => g !== null);
}

async function searchIndex(): Promise<FeedGame[]> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.games;
  if (indexInFlight) return indexInFlight;
  indexInFlight = (async () => {
    const pages = await Promise.all(
      Array.from({ length: INDEX_PAGES }, (_, i) => fetchIndexPage(i + 1)),
    );
    const seen = new Set<string>();
    const games: FeedGame[] = [];
    for (const g of pages.flat()) {
      if (seen.has(g.slug)) continue;
      seen.add(g.slug);
      games.push(g);
    }
    indexCache = { at: Date.now(), games };
    return games;
  })();
  try {
    return await indexInFlight;
  } finally {
    indexInFlight = null;
  }
}

/** Search the wider library by title / category, not just one loaded page. */
export async function searchFeedGames(term: string): Promise<FeedGame[]> {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const games = await searchIndex();
  const scored = games
    .map((g) => {
      const title = g.title.toLowerCase();
      let score = -1;
      if (title.startsWith(q)) score = 0;
      else if (title.includes(q)) score = 1;
      else if (g.category.replace(/-/g, " ").includes(q)) score = 2;
      else if (g.description.toLowerCase().includes(q)) score = 3;
      return { g, score };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, SEARCH_LIMIT).map((s) => s.g);
}

/**
 * Resolve the game's own build files (the actual playable game), skipping
 * the provider's branded launcher/consent screen. Returns null if the
 * lookup fails, in which case the player falls back to the launcher.
 */
async function fetchBuildUrl(slug: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.gamepix.com/v3/games/ns/${encodeURIComponent(slug)}/player`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    const info = (await res.json()) as { gameId?: string; version?: string; status?: string };
    if (!info.gameId || !info.version || (info.status && info.status !== "live")) return null;
    if (!/^[A-Za-z0-9]+$/.test(info.gameId) || !/^[A-Za-z0-9_-]+$/.test(info.version)) return null;
    const qs = new URLSearchParams({ sid: sid(), lang: "en", namespace: slug });
    return `https://games.builds.gamepix.com/${info.gameId}/${info.version}/index.html?${qs}`;
  } catch {
    return null;
  }
}

/** Look a single game up by slug so the play page can render real details. */
export async function fetchFeedGame(slug: string): Promise<FeedGame | null> {
  const buildUrlPromise = fetchBuildUrl(slug);
  let found: FeedGame | null = null;
  try {
    for (let page = 1; page <= 3; page++) {
      const { games } = await fetchFeedPage({ page, category: null });
      const hit = games.find((g) => g.slug === slug);
      if (hit) {
        found = hit;
        break;
      }
    }
  } catch {
    // Feed unreachable — fall through to the deterministic embed below so a
    // pinned/featured game stays playable.
  }
  // Not in the top pages — the embed URL is deterministic, so still playable.
  const game: FeedGame = found ?? {
    id: slug,
    slug,
    title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: "",
    category: "casual",
    thumb: "",
    url: `https://play.gamepix.com/${slug}/embed?sid=${sid()}`,
    width: 800,
    height: 600,
  };
  const buildUrl = await buildUrlPromise;
  return buildUrl ? { ...game, buildUrl } : game;
}
