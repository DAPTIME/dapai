// Rewritten to use the shared PolyTrackRunner and submit scores per level.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PolyTrackRunner } from "@/components/polytrack-runner";
import { Leaderboard, recordPersonalBest } from "@/components/track-leaderboard";
import { TrackThumbnail } from "@/components/track-thumbnail";
import { THEMES, type Season } from "@/lib/polytrack-engine";
import type { TrackParams } from "@/lib/track-validation";
import { submitScore } from "@/lib/tracks.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games/polytrack")({
  component: PolyTrack,
});

type Level = { id: number; season: Season; name: string; goal: number; params: TrackParams };

// Hand-tuned original layouts. Each level has a distinct "shape identity"
// (gentle sweeper / chicane / slalom / wide arc / tight technical) so no two
// tracks feel the same. Difficulty rises within each season: wider road +
// gentler curves early, narrower road + higher-frequency wiggles late.
const LEVELS: Level[] = [
  // ---------- SPRING (1-5): learning curve, wide and forgiving ----------
  { id: 1,  season: "spring", name: "First Bloom",     goal:  750, params: { amp1:  70, freq1: 0.0090, amp2: 14, freq2: 0.022, half: 108, phase: 0.10 } },
  { id: 2,  season: "spring", name: "Meadow Sweep",    goal:  900, params: { amp1: 110, freq1: 0.0110, amp2: 20, freq2: 0.026, half: 102, phase: 0.90 } },
  { id: 3,  season: "spring", name: "Creekside Bend",  goal: 1050, params: { amp1: 130, freq1: 0.0130, amp2: 28, freq2: 0.030, half:  96, phase: 1.70 } },
  { id: 4,  season: "spring", name: "Willow Chicane",  goal: 1200, params: { amp1:  90, freq1: 0.0200, amp2: 36, freq2: 0.038, half:  92, phase: 2.30 } },
  { id: 5,  season: "spring", name: "Blossom Rush",    goal: 1400, params: { amp1: 140, freq1: 0.0170, amp2: 44, freq2: 0.042, half:  86, phase: 3.10 } },

  // ---------- SUMMER (6-10): faster, wider arcs and long carries ----------
  { id: 6,  season: "summer", name: "Coast Cruise",    goal:  900, params: { amp1: 150, freq1: 0.0100, amp2: 16, freq2: 0.020, half: 100, phase: 0.30 } },
  { id: 7,  season: "summer", name: "Dune Waves",      goal: 1100, params: { amp1: 170, freq1: 0.0120, amp2: 24, freq2: 0.028, half:  94, phase: 1.10 } },
  { id: 8,  season: "summer", name: "Beachfront S",    goal: 1300, params: { amp1: 120, freq1: 0.0220, amp2: 34, freq2: 0.036, half:  90, phase: 2.00 } },
  { id: 9,  season: "summer", name: "Palm Slalom",     goal: 1500, params: { amp1:  80, freq1: 0.0300, amp2: 42, freq2: 0.048, half:  82, phase: 2.80 } },
  { id: 10, season: "summer", name: "Sunset Sprint",   goal: 1750, params: { amp1: 160, freq1: 0.0200, amp2: 56, freq2: 0.044, half:  78, phase: 3.60 } },

  // ---------- FALL (11-15): trickier rhythm, mixed frequencies ----------
  { id: 11, season: "fall",   name: "Amber Drift",     goal: 1000, params: { amp1: 130, freq1: 0.0120, amp2: 26, freq2: 0.026, half:  98, phase: 0.50 } },
  { id: 12, season: "fall",   name: "Maple Twist",     goal: 1250, params: { amp1: 160, freq1: 0.0160, amp2: 32, freq2: 0.034, half:  90, phase: 1.40 } },
  { id: 13, season: "fall",   name: "Harvest Weave",   goal: 1500, params: { amp1: 100, freq1: 0.0280, amp2: 44, freq2: 0.046, half:  84, phase: 2.20 } },
  { id: 14, season: "fall",   name: "Foliage Flick",   goal: 1750, params: { amp1: 170, freq1: 0.0210, amp2: 50, freq2: 0.050, half:  76, phase: 3.00 } },
  { id: 15, season: "fall",   name: "October Gauntlet",goal: 2050, params: { amp1:  95, freq1: 0.0360, amp2: 58, freq2: 0.056, half:  70, phase: 3.90 } },

  // ---------- WINTER (16-20): narrow, technical, high-frequency ----------
  { id: 16, season: "winter", name: "Frost Glide",     goal: 1100, params: { amp1: 140, freq1: 0.0140, amp2: 28, freq2: 0.028, half:  92, phase: 0.20 } },
  { id: 17, season: "winter", name: "Glacier Bend",    goal: 1400, params: { amp1: 180, freq1: 0.0180, amp2: 38, freq2: 0.036, half:  84, phase: 1.20 } },
  { id: 18, season: "winter", name: "Blizzard Slalom", goal: 1700, params: { amp1:  90, freq1: 0.0380, amp2: 52, freq2: 0.052, half:  74, phase: 2.10 } },
  { id: 19, season: "winter", name: "Aurora Twist",    goal: 2000, params: { amp1: 170, freq1: 0.0240, amp2: 62, freq2: 0.054, half:  68, phase: 3.20 } },
  { id: 20, season: "winter", name: "Ice Peak Finale", goal: 2400, params: { amp1: 110, freq1: 0.0420, amp2: 72, freq2: 0.062, half:  60, phase: 4.30 } },
];

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
    // Record locally so the "Your best" row updates instantly.
    recordPersonalBest(`builtin:${level.id}`, ms);
    setLbKey((k) => k + 1);
    if (userId) {
      submit({ data: { trackRef: `builtin:${level.id}`, timeMs: ms } }).catch(() => {});
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
