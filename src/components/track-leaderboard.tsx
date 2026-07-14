// Leaderboard for a specific track_ref (builtin:N or custom:UUID).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getLeaderboard } from "@/lib/tracks.functions";
import { formatMs } from "@/lib/polytrack-engine";

export function Leaderboard({ trackRef, refreshKey }: { trackRef: string; refreshKey?: number }) {
  const fetchLb = useServerFn(getLeaderboard);
  const [rows, setRows] = useState<Array<{ name: string; best_time_ms: number; rank: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    fetchLb({ data: { trackRef, limit: 10 } })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [trackRef, refreshKey, fetchLb]);

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">🏆 Leaderboard</h2>
        <span className="text-xs text-muted-foreground">Top 10 · fastest first</span>
      </div>
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
    </div>
  );
}
