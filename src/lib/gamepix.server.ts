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
  width: number;
  height: number;
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

/** Look a single game up by slug so the play page can render real details. */
export async function fetchFeedGame(slug: string): Promise<FeedGame | null> {
  for (let page = 1; page <= 3; page++) {
    const { games } = await fetchFeedPage({ page, category: null });
    const hit = games.find((g) => g.slug === slug);
    if (hit) return hit;
  }
  // Not in the top pages — the embed URL is deterministic, so still playable.
  return {
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
}
