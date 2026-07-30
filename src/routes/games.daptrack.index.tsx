// DAP Track — built-in level select + runner.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PolyTrackRunner, type RunResult } from "@/components/polytrack-runner";
import { Leaderboard } from "@/components/track-leaderboard";
import { TrackThumbnail } from "@/components/track-thumbnail";
import {
  THEMES, SEASONS, MEDAL_META, formatMs, medalFor, readPersonalBest, recordPersonalBest,
  type Season,
} from "@/lib/polytrack-engine";
import { submitScore } from "@/lib/tracks.functions";
import { BUILTINS, BUILTINS_BY_SEASON, type Difficulty } from "@/lib/track-builtins";

export const Route = createFileRoute("/games/daptrack/")({
  head: () => ({
    meta: [
      { title: "DAP Track — 3D Time Trials" },
      { name: "description", content: "Low-poly 3D time trials with checkpoints, ghosts, medals and a track editor." },
    ],
  }),
  component: PolyRacer,
});

const trackRefOf = (id: number) => `builtin:${id}`;

const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  easy: "text-emerald-500",
  medium: "text-amber-500",
  hard: "text-rose-500",
};

function PolyRacer() {
  const [levelId, setLevelId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [lbKey, setLbKey] = useState(0);
  const [bests, setBests] = useState<Record<number, number | null>>({});
  const [season, setSeason] = useState<Season>("spring");
  const submit = useServerFn(submitScore);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setUserId(data.user?.id ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const refreshBests = useCallback(() => {
    const next: Record<number, number | null> = {};
    for (const l of BUILTINS) next[l.id] = readPersonalBest(trackRefOf(l.id));
    setBests(next);
  }, []);
  useEffect(() => { refreshBests(); }, [refreshBests, levelId]);

  const level = levelId != null ? BUILTINS.find((l) => l.id === levelId) ?? null : null;

  const handleFinish = (ms: number, result: RunResult) => {
    if (!level) return;
    recordPersonalBest(trackRefOf(level.id), ms);
    refreshBests();
    setLbKey((k) => k + 1);
    if (result.medal) {
      const m = MEDAL_META[result.medal];
      toast.success(`${m.emoji} ${m.label} medal — ${formatMs(ms)}`);
    }
    if (userId) submit({ data: { trackRef: trackRefOf(level.id), timeMs: ms } }).catch(() => {});
    else if (result.isPersonalBest) toast.info("Sign in to post this time to the site-wide leaderboard.");
  };

  if (!level) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">DAP Track 🏎️</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Low-poly 3D time trials over {BUILTINS.length} tracks — hills, flyovers and jumps. Hit every
              checkpoint, beat the medal times, then chase your own ghost.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/games/daptrack/browse" className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-primary">
              🌐 Community
            </Link>
            <Link to="/games/daptrack/editor" className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
              ✏️ Editor
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {SEASONS.map((s) => {
            const set = BUILTINS_BY_SEASON[s];
            const won = set.filter((l) => bests[l.id] != null).length;
            return (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  season === s ? "border-primary bg-primary/10 font-medium" : "border-border hover:border-primary/50"
                }`}
              >
                {THEMES[s].emoji} {THEMES[s].label}
                <span className="ml-1.5 text-xs text-muted-foreground">{won}/{set.length}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BUILTINS_BY_SEASON[season].map((l) => {
            const pb = bests[l.id] ?? null;
            const medal = pb != null ? medalFor(pb, l.goal) : null;
            return (
              <button
                key={l.id}
                onClick={() => setLevelId(l.id)}
                className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary"
              >
                <TrackThumbnail data={l.data} season={l.season} width={260} className="w-full" />
                <div className="border-t border-border/60 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <span className="truncate font-semibold">{l.name}</span>
                    {medal && <span title={`${MEDAL_META[medal].label} medal`}>{MEDAL_META[medal].emoji}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className={DIFFICULTY_CLASS[l.difficulty]}>{l.difficulty}</span>
                    <span>{pb != null ? `PB ${formatMs(pb)}` : `🎯 ${formatMs(l.goal)}`}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">How it works — </span>
          drive through every checkpoint before crossing the finish. <kbd>R</kbd> respawns at your last
          checkpoint, <kbd>Enter</kbd> restarts the run, <kbd>Space</kbd> drifts and <kbd>C</kbd> changes camera.
          Beat the target time for the author medal.
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
        title={`${THEMES[level.season].emoji} ${level.name}`}
        trackRef={trackRefOf(level.id)}
        onFinish={handleFinish}
        onExit={() => setLevelId(null)}
        exitLabel="Levels"
      />
      <div className="mx-auto max-w-md">
        <Leaderboard trackRef={trackRefOf(level.id)} refreshKey={lbKey} />
      </div>
    </div>
  );
}
