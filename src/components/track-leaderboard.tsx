// Leaderboard for a specific track_ref (builtin:N or custom:UUID).
// Site-wide board polls every 5 minutes. The player's own best time is
// tracked locally and shown instantly after every finished run.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getLeaderboard } from "@/lib/tracks.functions";
import { formatMs, readPersonalBest, recordPersonalBest } from "@/lib/polytrack-engine";

// Personal-best storage lives in the engine so the runner, the routes and
// this board all agree on one key.
export { readPersonalBest, recordPersonalBest };

export function Leaderboard({ trackRef, refreshKey }: { trackRef: string; refreshKey?: number }) {
  const fetchLb = useServerFn(getLeaderboard);
  const [rows, setRows] = useState<Array<{ name: string; best_time_ms: number; rank: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personal, setPersonal] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(() => Date.now());

  // Personal best updates instantly whenever refreshKey ticks.
  useEffect(() => {
    setPersonal(readPersonalBest(trackRef));
  }, [trackRef, refreshKey]);

  // Global board: initial load per track, then every 5 minutes.
  // Intentionally NOT refetched on refreshKey.
  useEffect(() => {
    let cancelled = false;
    const load = (initial: boolean) => {
      if (initial) { setRows(null); setError(null); }
      fetchLb({ data: { trackRef, limit: 10 } })
        .then((r) => { if (!cancelled) { setRows(r); setLastRefresh(Date.now()); } })
        .catch((e: Error) => { if (!cancelled) setError(e.message); });
    };
    load(true);
    const iv = setInterval(() => load(false), 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [trackRef, fetchLb]);

  const nextMin = Math.max(0, Math.ceil((5 * 60 * 1000 - (Date.now() - lastRefresh)) / 60000));

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">🏆 Leaderboard</h2>
        <span className="text-xs text-muted-foreground">Top 10 · refreshes every 5 min</span>
      </div>
      {personal != null && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-sm">
          <span className="font-medium">Your best</span>
          <span className="font-mono">{formatMs(personal)}</span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!rows && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No times yet. Be the first!</p>
      )}
      {rows && rows.length > 0 && (
        <ol className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.rank} className="flex items-center justify-between rounded px-2 py-1 odd:bg-muted/30">
              <span className="flex items-center gap-2">
                <span className="w-6 text-right text-xs text-muted-foreground">#{r.rank}</span>
                <span className="font-medium">{r.name}</span>
              </span>
              <span className="font-mono text-sm">{formatMs(r.best_time_ms)}</span>
            </li>
          ))}
        </ol>
      )}
      {rows && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Next site-wide refresh in ~{nextMin} min
        </p>
      )}
    </div>
  );
}
