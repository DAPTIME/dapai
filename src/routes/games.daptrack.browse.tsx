// DAP Track level browser — community tracks plus everything you've built.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { THEMES, formatMs, type Season } from "@/lib/polytrack-engine";
import { TrackThumbnail } from "@/components/track-thumbnail";
import {
  listPublicTracks, listMyTracks, publishTrack, unpublishTrack, deleteTrack,
  getTrackQuota,
} from "@/lib/tracks.functions";
import { Leaderboard } from "@/components/track-leaderboard";
import { useUpgradeGate } from "@/lib/tier-gate";

export const Route = createFileRoute("/games/daptrack/browse")({
  head: () => ({
    meta: [
      { title: "Community Levels — DAP Track" },
      { name: "description", content: "Browse, race, and manage player-built DAP Track levels." },
      { property: "og:title", content: "Community Levels — DAP Track" },
      { property: "og:description", content: "Browse, race, and manage player-built DAP Track levels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrowsePage,
});

type Tab = "community" | "mine";
type Sort = "new" | "plays" | "name";
const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

interface Row {
  id: string;
  name: string;
  season: string;
  goal: number;
  play_count: number;
  created_at: string;
  params: unknown;
  is_public?: boolean;
}

function BrowsePage() {
  const navigate = useNavigate();
  const fetchPublic = useServerFn(listPublicTracks);
  const fetchMine = useServerFn(listMyTracks);
  const publish = useServerFn(publishTrack);
  const unpublish = useServerFn(unpublishTrack);
  const remove = useServerFn(deleteTrack);
  const fetchQuota = useServerFn(getTrackQuota);
  const { requireTier } = useUpgradeGate();
  const [quota, setQuota] = useState<{
    used: number; limit: number | null; canCreate: boolean;
  } | null>(null);
  const [openBoard, setOpenBoard] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("community");
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [community, setCommunity] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [seasonFilter, setSeasonFilter] = useState<Season | "all">("all");
  const [sort, setSort] = useState<Sort>("new");

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);

  const loadCommunity = useCallback(() => {
    fetchPublic({})
      .then((r) => setCommunity(r as Row[]))
      .catch((e: Error) => setErr(e.message));
  }, [fetchPublic]);

  const loadMine = useCallback(() => {
    if (!userId) { setMine([]); return; }
    fetchMine({})
      .then((r) => setMine(r as Row[]))
      .catch((e: Error) => setErr(e.message));
  }, [fetchMine, userId]);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);
  useEffect(() => { if (userId !== undefined) loadMine(); }, [userId, loadMine]);

  useEffect(() => {
    if (!userId) { setQuota(null); return; }
    fetchQuota({}).then(setQuota).catch(() => setQuota(null));
  }, [userId, fetchQuota, mine]);

  /** Building is a paid feature, and each plan keeps a fixed number. */
  const startNewTrack = () => {
    if (!userId) { void navigate({ to: "/login" }); return; }
    if (quota && !quota.canCreate) {
      if (quota.limit === 0) {
        requireTier("go", "Building DAP Track levels");
      } else {
        toast.error(
          `Your plan keeps ${quota.limit} tracks. Delete one or upgrade for more.`
        );
      }
      return;
    }
    void navigate({ to: "/games/daptrack/editor", search: {} });
  };

  const rows = tab === "community" ? community : mine;

  const visible = useMemo(() => {
    if (!rows) return null;
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter(
      (r) => (seasonFilter === "all" || r.season === seasonFilter) && (!needle || r.name.toLowerCase().includes(needle))
    );
    const sorted = [...filtered];
    if (sort === "plays") sorted.sort((a, b) => b.play_count - a.play_count);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sorted;
  }, [rows, q, seasonFilter, sort]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); loadMine(); loadCommunity(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏁 DAP Track Levels</h1>
          <p className="mt-1 text-sm text-muted-foreground">Race what the community built, or manage your own tracks.</p>
          {quota && (
            <p className="mt-1 text-xs text-muted-foreground">
              {quota.limit === null
                ? `Unlimited tracks · ${quota.used} built`
                : quota.limit === 0
                  ? "Your plan can't build levels — Go keeps 3, Pro 10, Exclusive unlimited."
                  : `${quota.used} / ${quota.limit} tracks used on your plan`}
            </p>
          )}
        </div>
        <div className="flex gap-2 text-sm">
          <Link to="/games/daptrack" className="rounded-lg border border-border px-3 py-1.5 hover:border-primary">← DAP Track</Link>
          <button onClick={startNewTrack} className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90">+ New track</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 border-b border-border">
        {([["community", "🌐 Community"], ["mine", "🔒 My tracks"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === key ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {key === "mine" && mine ? ` (${mine.length})` : ""}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tracks…" className="h-9 max-w-[220px]" />
        <div className="flex gap-1">
          <button onClick={() => setSeasonFilter("all")}
            className={`rounded-md border px-2 py-1 text-xs ${seasonFilter === "all" ? "border-primary bg-primary/10" : "border-border"}`}>All</button>
          {SEASONS.map((s) => (
            <button key={s} onClick={() => setSeasonFilter(s)} title={THEMES[s].label}
              className={`rounded-md border px-2 py-1 text-sm ${seasonFilter === s ? "border-primary bg-primary/10" : "border-border"}`}>
              {THEMES[s].emoji}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="new">Newest</option>
          <option value="plays">Most played</option>
          <option value="name">Name</option>
        </select>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setErr(null); loadCommunity(); loadMine(); }}>
          ↻ Refresh
        </Button>
      </div>

      {err && <p className="mb-3 text-sm text-destructive">{err}</p>}
      {!visible && <p className="text-sm text-muted-foreground">Loading…</p>}

      {tab === "mine" && userId === null && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Sign in to build and save your own tracks.</p>
          <Link to="/login" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Sign in</Link>
        </div>
      )}

      {visible && visible.length === 0 && !(tab === "mine" && userId === null) && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {q || seasonFilter !== "all" ? "No tracks match those filters." : tab === "mine" ? "You haven't built a track yet." : "No public tracks yet."}
          </p>
          <button onClick={startNewTrack} className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
            Open the editor
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible?.map((t) => {
          const theme = THEMES[t.season as Season];
          return (
            <div
              key={t.id}
              className="group overflow-hidden rounded-xl border border-border bg-card/40 transition-all hover:-translate-y-0.5 hover:border-primary"
              style={{ boxShadow: `inset 0 -3px 0 ${theme.ground}` }}
            >
              <Link to="/games/daptrack/track/$id" params={{ id: t.id }} className="block">
                <TrackThumbnail data={t.params} season={t.season as Season} width={320} className="w-full border-b border-border" />
              </Link>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/games/daptrack/track/$id" params={{ id: t.id }} className="truncate text-base font-semibold hover:text-primary">
                    {theme.emoji} {t.name}
                  </Link>
                  {tab === "mine" && <span className="shrink-0 text-xs">{t.is_public ? "🌐" : "🔒"}</span>}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>🎯 {formatMs(t.goal)}</span>
                  <span>▶ {t.play_count}</span>
                </div>
                <button
                  onClick={() => setOpenBoard(openBoard === t.id ? null : t.id)}
                  className="mt-2 text-xs text-muted-foreground hover:text-primary"
                >
                  🏆 {openBoard === t.id ? "Hide leaderboard" : "Leaderboard"}
                </button>
                {openBoard === t.id && (
                  <div className="mt-2 animate-fade-in">
                    <Leaderboard trackRef={`custom:${t.id}`} />
                  </div>
                )}
                {tab === "mine" && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="secondary" className="h-7 px-2 text-xs"
                      onClick={() => navigate({ to: "/games/daptrack/editor", search: { id: t.id } })}>Edit</Button>
                    {t.is_public
                      ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => act(() => unpublish({ data: { id: t.id } }), "Unpublished.")}>Unpublish</Button>
                      : <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => act(() => publish({ data: { id: t.id } }), "Track is public!")}>Publish</Button>}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive"
                      onClick={() => { if (confirm(`Delete "${t.name}"?`)) void act(() => remove({ data: { id: t.id } }), "Track deleted."); }}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
