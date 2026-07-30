import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPublicTracks } from "@/lib/tracks.functions";
import { THEMES, formatMs, type Season } from "@/lib/polytrack-engine";
import { TrackThumbnail } from "@/components/track-thumbnail";

export const Route = createFileRoute("/games/daptrack/browse")({
  head: () => ({ meta: [{ title: "Community Tracks — DAP Track" }] }),
  component: BrowsePage,
});

function BrowsePage() {
  const fetchList = useServerFn(listPublicTracks);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPublicTracks>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchList({})
        .then((r) => { if (!cancelled) setRows(r); })
        .catch((e: Error) => { if (!cancelled) setErr(e.message); });
    };
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [fetchList]);

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🌐 Community Tracks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tracks built and published by other players.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/games/daptrack" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary">← DAP Track</Link>
          <Link to="/games/daptrack/editor" className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">Build one</Link>
        </div>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!rows && !err && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No public tracks yet.</p>
          <Link to="/games/daptrack/editor" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Be the first</Link>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows?.map((t) => {
          const theme = THEMES[t.season as Season];
          return (
            <Link
              key={t.id}
              to="/games/daptrack/track/$id"
              params={{ id: t.id }}
              className="group overflow-hidden rounded-xl border border-border bg-card/40 transition-all hover:-translate-y-0.5 hover:border-primary"
              style={{ boxShadow: `inset 0 -3px 0 ${theme.ground}` }}
            >
              <TrackThumbnail data={t.params} season={t.season as Season} width={320} className="w-full border-b border-border" />
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">{theme.emoji} {t.name}</div>
                  <span className="text-xs text-muted-foreground">{theme.label}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>🎯 {formatMs(t.goal)}</span>
                  <span>▶ {t.play_count}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
