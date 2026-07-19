// DAP Track built-in level select + runner.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PolyTrackRunner } from "@/components/polytrack-runner";
import { Leaderboard, recordPersonalBest } from "@/components/track-leaderboard";
import { TrackThumbnail } from "@/components/track-thumbnail";
import { THEMES, type Season } from "@/lib/polytrack-engine";
import { submitScore } from "@/lib/tracks.functions";
import { BUILTINS } from "@/lib/track-builtins";

export const Route = createFileRoute("/games/polytrack")({
  head: () => ({ meta: [{ title: "DAP Track — 3D Time Trials" }] }),
  component: DapTrack,
});

function DapTrack() {
  const [levelId, setLevelId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [lbKey, setLbKey] = useState(0);
  const submit = useServerFn(submitScore);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setUserId(data.user?.id ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const level = levelId != null ? BUILTINS.find((l) => l.id === levelId) ?? null : null;

  const handleFinish = (ms: number) => {
    if (!level) return;
    recordPersonalBest(`builtin:${level.id}`, ms);
    setLbKey((k) => k + 1);
    if (userId) submit({ data: { trackRef: `builtin:${level.id}`, timeMs: ms } }).catch(() => {});
  };

  if (!level) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">DAP Track 🏎️</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              3D low-poly time trials. Play the built-ins or build your own.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/games/polytrack/browse" className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-primary">
              🌐 Community
            </Link>
            <Link to="/games/polytrack/editor" className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
              ✏️ Editor
            </Link>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BUILTINS.map((l) => {
            const t = THEMES[l.season];
            return (
              <button
                key={l.id}
                onClick={() => setLevelId(l.id)}
                className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary"
              >
                <TrackThumbnail data={l.data} season={l.season} width={200} />
                <div className="flex items-center justify-between border-t border-border/60 px-2 py-1.5 text-xs">
                  <span className="font-semibold">{t.emoji} {l.name}</span>
                  <span className="text-muted-foreground">#{l.id}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PolyTrackRunner
        data={level.data}
        season={level.season}
        goal={level.goal}
        title={level.name}
        trackRef={`builtin:${level.id}`}
        onFinish={handleFinish}
        onExit={() => setLevelId(null)}
        exitLabel="Levels"
      />
      <div className="mx-auto max-w-md">
        <Leaderboard trackRef={`builtin:${level.id}`} refreshKey={lbKey} />
      </div>
    </div>
  );
}
