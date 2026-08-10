// Leaderboard for a specific track_ref (builtin:N or custom:UUID).
// Site-wide board polls every 5 minutes. The player's own best time is
// tracked locally and shown instantly after every finished run.
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getLeaderboard } from "@/lib/tracks.functions";
// Personal-best storage lives in @/lib/polytrack-engine so the runner, the
// routes and this board all agree on one key.
import { formatMs, readPersonalBest } from "@/lib/polytrack-engine";

export function Leaderboard({ trackRef, refreshKey }: { trackRef: string; refreshKey?: number }) {
  const fetchLb = useServerFn(getLeaderboard);
  const [rows, setRows] = useState<Array<{ name: string; best_time_ms: number; rank: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personal, setPersonal] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(() => Date.now());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  // Records are only stored site-wide for signed-in players; guests still play
  // and keep local personal bests.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setSignedIn(!!data.user); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s?.user));
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);


  // Personal best updates instantly whenever refreshKey ticks.
  useEffect(() => {
    setPersonal(readPersonalBest(trackRef));
  }, [trackRef, refreshKey]);

  /* One loader for all three callers: the first paint, the five-minute
     poll, and the reload a finished run asks for. `alive` is a ref
     rather than a per-effect local so a reload started by one effect is
     still cancelled when the component unmounts or the track changes. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback((initial: boolean) => {
    if (initial) { setRows(null); setError(null); }
    return fetchLb({ data: { trackRef, limit: 10 } })
      .then((r) => { if (alive.current) { setRows(r); setLastRefresh(Date.now()); } })
      .catch((e: Error) => { if (alive.current) setError(e.message); });
  }, [trackRef, fetchLb]);

  // Everyone else's times arrive on the five-minute poll.
  useEffect(() => {
    load(true);
    const iv = setInterval(() => load(false), 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  /* Your own run shows up straight away. This used to be deliberately
     skipped — the comment here said so — which is why a new personal
     best updated the strip above but never the board: the only thing
     that moved it was the poll, so your own time took up to five
     minutes to appear. The caller bumps refreshKey *after* the write
     resolves, so the row is there to read by the time this runs. The
     first render is skipped, since the effect above already loaded. */
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) { firstKey.current = false; return; }
    load(false);
  }, [refreshKey, load]);

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
      {signedIn === false && (
        <div className="mb-3 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
          Playing as a guest — times stay on this device.{" "}
          <Link to="/login" className="font-medium text-primary underline">Sign in</Link> to save records to the leaderboard.
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
