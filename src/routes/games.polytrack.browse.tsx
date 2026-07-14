import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPublicTracks } from "@/lib/tracks.functions";
import { THEMES, type Season } from "@/lib/polytrack-engine";
import { TrackThumbnail } from "@/components/track-thumbnail";
import type { TrackParams } from "@/lib/track-validation";

export const Route = createFileRoute("/games/polytrack/browse")({
  head: () => ({ meta: [{ title: "User Tracks — Poly Racer" }] }),
  component: BrowsePage,
});

function BrowsePage() {
  const fetchList = useServerFn(listPublicTracks);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPublicTracks>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchList({}).then(setRows).catch((e: Error) => setErr(e.message));
  }, [fetchList]);

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🌐 User-Made Tracks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Community-built Poly Racer levels.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/games/polytrack" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary">← Poly Racer</Link>
          <Link to="/games/polytrack/editor" className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">Build one</Link>
        </div>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!rows && !err && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No public tracks yet.</p>
          <Link to="/games/polytrack/editor" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Be the first</Link>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows?.map((t) => {
          const theme = THEMES[t.season as Season];
          return (
            <Link
              key={t.id}
              to="/games/polytrack/track/$id"
              params={{ id: t.id }}
              className="group overflow-hidden rounded-xl border border-border bg-card/40 transition-all hover:-translate-y-0.5 hover:border-primary"
              style={{ boxShadow: `inset 0 -3px 0 ${theme.ground}` }}
            >
              <TrackThumbnail
                params={t.params as unknown as TrackParams}
                season={t.season as Season}
                goal={t.goal}
                width={320}
                className="w-full border-b border-border"
              />
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">{theme.emoji} {t.name}</div>
                  <span className="text-xs text-muted-foreground">{theme.label}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Goal {t.goal}</span>
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
