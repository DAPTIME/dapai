// Rewritten to use the shared PolyTrackRunner and submit scores per level.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PolyTrackRunner } from "@/components/polytrack-runner";
import { Leaderboard } from "@/components/track-leaderboard";
import { TrackThumbnail } from "@/components/track-thumbnail";
import { THEMES, type Season } from "@/lib/polytrack-engine";
import type { TrackParams } from "@/lib/track-validation";
import { submitScore } from "@/lib/tracks.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games/polytrack")({
  component: PolyTrack,
});

type Level = { id: number; season: Season; name: string; goal: number; params: TrackParams };

const LEVELS: Level[] = Array.from({ length: 20 }, (_, i) => {
  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const season = seasons[Math.floor(i / 5)];
  const within = i % 5;
  const num = within + 1;
  const seasonPhase = { spring: 0, summer: 1.3, fall: 2.7, winter: 0.6 }[season];
  return {
    id: i + 1,
    season,
    name: `${THEMES[season].label} ${num}`,
    goal: 600 + num * 250,
    params: {
      amp1: 55 + within * 12,
      freq1: 0.0055 + within * 0.0012,
      amp2: 18 + within * 6,
      freq2: 0.016 + within * 0.0025,
      half: 96 - within * 6,
      phase: seasonPhase + (i + 1) * 0.41,
    },
  };
});

const DEFAULT_UNLOCKED = new Set<number>([1, 6, 11, 16]);

function storageKey(uid: string | null) { return `dap.polytrack.unlocked.${uid ?? "anon"}`; }
function loadUnlocked(uid: string | null): Set<number> {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return new Set(DEFAULT_UNLOCKED);
    const arr = JSON.parse(raw) as number[];
    const s = new Set<number>(arr.filter((n) => n >= 1 && n <= 20));
    for (const d of DEFAULT_UNLOCKED) s.add(d);
    return s;
  } catch { return new Set(DEFAULT_UNLOCKED); }
}
function saveUnlocked(uid: string | null, u: Set<number>) {
  try { localStorage.setItem(storageKey(uid), JSON.stringify([...u])); } catch { /* ignore */ }
}

function PolyTrack() {
  const [levelIdx, setLevelIdx] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Set<number>>(() => new Set(DEFAULT_UNLOCKED));
  const [lbKey, setLbKey] = useState(0);
  const submit = useServerFn(submitScore);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      setUnlocked(loadUnlocked(uid));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      setUnlocked(loadUnlocked(uid));
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const level = levelIdx != null ? LEVELS[levelIdx] : null;
  const seasons = useMemo(() => ["spring", "summer", "fall", "winter"] as Season[], []);

  const handleFinish = (ms: number) => {
    if (!level) return;
    setUnlocked((prev) => {
      const next = new Set(prev);
      next.add(level.id);
      if (level.id < 20) next.add(level.id + 1);
      saveUnlocked(userId, next);
      return next;
    });
    if (userId) {
      submit({ data: { trackRef: `builtin:${level.id}`, timeMs: ms } })
        .then(() => setLbKey((k) => k + 1))
        .catch(() => {});
    }
  };

  if (level == null) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Poly Racer 🏎️</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              20 built-in levels, or build and share your own.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/games/polytrack/browse"
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-primary"
            >
              🌐 User Tracks
            </Link>
            <Link
              to="/games/polytrack/editor"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              ✏️ Level Editor
            </Link>
          </div>
        </div>
        {seasons.map((season) => {
          const t = THEMES[season];
          return (
            <div key={season} className="mt-5">
              <div className="mb-2 text-sm font-semibold">{t.emoji} {t.label}</div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {LEVELS.filter((l) => l.season === season).map((l) => {
                  const isUnlocked = unlocked.has(l.id);
                  return (
                    <button
                      key={l.id}
                      disabled={!isUnlocked}
                      onClick={() => setLevelIdx(l.id - 1)}
                      className={`group relative overflow-hidden rounded-lg border text-sm font-semibold transition-all ${
                        isUnlocked
                          ? "border-primary/40 bg-card hover:-translate-y-0.5 hover:border-primary"
                          : "cursor-not-allowed border-border bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <div className={isUnlocked ? "" : "opacity-40 blur-[1px]"}>
                        <TrackThumbnail
                          params={l.params}
                          season={l.season}
                          goal={l.goal}
                          width={140}
                          className="w-full"
                        />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-1 text-[11px] text-white">
                        <span>{isUnlocked ? `#${l.id}` : "🔒"}</span>
                        <span className="opacity-80">{t.emoji}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <PolyTrackRunner
        params={level.params}
        season={level.season}
        goal={level.goal}
        title={level.name}
        onFinish={handleFinish}
        onExit={() => setLevelIdx(null)}
        exitLabel="Levels"
      />
      <div className="mx-auto max-w-md">
        <Leaderboard trackRef={`builtin:${level.id}`} refreshKey={lbKey} />
      </div>
    </div>
  );
}
