import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/games/polytrack")({
  component: PolyTrack,
});

const W = 480;
const H = 640;

type Season = "spring" | "summer" | "fall" | "winter";

type Theme = {
  ground: string;
  road: string;
  roadEdge: string;
  dash: string;
  label: string;
  emoji: string;
  fleck: string;
};

const THEMES: Record<Season, Theme> = {
  spring: { ground: "#1f7a3a", road: "#3a3a44", roadEdge: "#e5e7eb", dash: "#fde047", label: "Spring", emoji: "🌱", fleck: "#4ade80" },
  summer: { ground: "#d9b26a", road: "#a88558", roadEdge: "#f4e2b8", dash: "#ffffff", label: "Summer", emoji: "🏜️", fleck: "#f5deb3" },
  fall:   { ground: "#7a3e1d", road: "#3a3a44", roadEdge: "#e5e7eb", dash: "#fde047", label: "Fall",   emoji: "🍂", fleck: "#f97316" },
  winter: { ground: "#e8eef5", road: "#c9d3de", roadEdge: "#94a3b8", dash: "#64748b", label: "Winter", emoji: "❄️", fleck: "#ffffff" },
};

type Level = { id: number; season: Season; name: string; goal: number };

const LEVELS: Level[] = Array.from({ length: 20 }, (_, i) => {
  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const season = seasons[Math.floor(i / 5)];
  const within = (i % 5) + 1;
  return {
    id: i + 1,
    season,
    name: `${THEMES[season].label} ${within}`,
    goal: 600 + within * 250, // reachable: 850–1600 progress units per level
  };
});

// First level of every season is unlocked by default.
const DEFAULT_UNLOCKED = new Set<number>([1, 6, 11, 16]);

type Params = {
  amp1: number; freq1: number;
  amp2: number; freq2: number;
  half: number; phase: number;
};

function paramsFor(level: Level): Params {
  const within = (level.id - 1) % 5;      // 0..4 difficulty within season
  const seasonPhase = { spring: 0, summer: 1.3, fall: 2.7, winter: 0.6 }[level.season];
  return {
    amp1: 55 + within * 12,               // 55..103 — main curve
    freq1: 0.0055 + within * 0.0012,      // gentle → wavier
    amp2: 18 + within * 6,                // 18..42 — secondary wobble
    freq2: 0.016 + within * 0.0025,
    half: 96 - within * 6,                // 96..72 — road narrows with difficulty
    phase: seasonPhase + level.id * 0.41, // every level has a distinct shape
  };
}

function centerAtWith(y: number, p: Params) {
  return W / 2
    + Math.sin(y * p.freq1 + p.phase) * p.amp1
    + Math.sin(y * p.freq2 + p.phase * 1.7) * p.amp2;
}

// Local per-account storage key. Falls back to "anon" when signed out.
function storageKey(userId: string | null) {
  return `dap.polytrack.unlocked.${userId ?? "anon"}`;
}

function loadUnlocked(userId: string | null): Set<number> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set(DEFAULT_UNLOCKED);
    const arr = JSON.parse(raw) as number[];
    const s = new Set<number>(arr.filter((n) => n >= 1 && n <= 20));
    for (const d of DEFAULT_UNLOCKED) s.add(d);
    return s;
  } catch {
    return new Set(DEFAULT_UNLOCKED);
  }
}

function saveUnlocked(userId: string | null, unlocked: Set<number>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...unlocked]));
  } catch {
    /* ignore quota */
  }
}

function PolyTrack() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [levelIdx, setLevelIdx] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Set<number>>(() => new Set(DEFAULT_UNLOCKED));

  // Load current user, then load their unlock set.
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

  const stateRef = useRef({
    car: { x: W / 2, y: H - 100, vx: 0, vy: 0, ang: -Math.PI / 2 },
    keys: {} as Record<string, boolean>,
    trackOffset: 0,
    params: paramsFor(LEVELS[0]),
  });

  const level = levelIdx != null ? LEVELS[levelIdx] : null;

  const start = useCallback((idx: number) => {
    const l = LEVELS[idx];
    const p = paramsFor(l);
    // Spawn ON the road: use the track's actual center at the spawn y.
    const spawnY = H - 100;
    const cx = centerAtWith(spawnY, p);
    stateRef.current.car = { x: cx, y: spawnY, vx: 0, vy: 0, ang: -Math.PI / 2 };
    stateRef.current.trackOffset = 0;
    stateRef.current.params = p;
    setLevelIdx(idx);
    setScore(0);
    setDead(false);
    setWon(false);
    setRunning(true);
  }, []);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { stateRef.current.keys[e.key] = true; };
    const ku = (e: KeyboardEvent) => { stateRef.current.keys[e.key] = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  useEffect(() => {
    if (!running || level == null) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const theme = THEMES[level.season];
    const p = stateRef.current.params;
    let handle = 0;

    const flecks = Array.from({ length: 90 }, (_, i) => ({
      x: (i * 97 + level.id * 13) % W,
      y: (i * 53 + level.id * 29) % H,
      r: 1 + ((i * 7) % 3),
    }));

    const loop = () => {
      const s = stateRef.current;
      const k = s.keys;
      const turning = (k["ArrowLeft"] || k["a"] ? -1 : 0) + (k["ArrowRight"] || k["d"] ? 1 : 0);
      const gas = (k["ArrowUp"] || k["w"]) ? 1 : 0;
      const brake = (k["ArrowDown"] || k["s"]) ? 1 : 0;

      // === IDENTICAL PHYSICS ACROSS ALL SEASONS ===
      s.car.ang += turning * 0.05;
      const accel = gas * 0.25 - brake * 0.18;
      s.car.vx += Math.cos(s.car.ang) * accel;
      s.car.vy += Math.sin(s.car.ang) * accel;
      s.car.vx *= 0.97; s.car.vy *= 0.97;
      s.car.x += s.car.vx;
      s.trackOffset += -s.car.vy;
      s.car.vy = Math.max(-6, Math.min(6, s.car.vy));
      const speed = Math.hypot(s.car.vx, s.car.vy);

      if (s.car.x < 0 || s.car.x > W) { setRunning(false); setDead(true); return; }

      const worldY = s.trackOffset + s.car.y;
      const cx = centerAtWith(worldY, p);
      if (Math.abs(s.car.x - cx) > p.half) {
        setRunning(false); setDead(true); return;
      }

      const progress = Math.max(0, Math.floor(s.trackOffset / 10));
      setScore(progress);

      if (progress >= level.goal) {
        setRunning(false);
        setWon(true);
        setUnlocked((prev) => {
          const next = new Set(prev);
          next.add(level.id);
          if (level.id < 20) next.add(level.id + 1);
          saveUnlocked(userId, next);
          return next;
        });
        return;
      }

      // ground
      ctx.fillStyle = theme.ground;
      ctx.fillRect(0, 0, W, H);
      // flecks
      ctx.fillStyle = theme.fleck;
      const scroll = s.trackOffset % H;
      for (const f of flecks) {
        const y = (f.y + scroll) % H;
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(f.x, y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // road ribbon
      ctx.fillStyle = theme.road;
      ctx.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const c = centerAtWith(s.trackOffset + y, p);
        if (y === 0) ctx.moveTo(c - p.half, y);
        else ctx.lineTo(c - p.half, y);
      }
      for (let y = H; y >= 0; y -= 8) {
        const c = centerAtWith(s.trackOffset + y, p);
        ctx.lineTo(c + p.half, y);
      }
      ctx.closePath();
      ctx.fill();

      // road edges
      ctx.strokeStyle = theme.roadEdge;
      ctx.lineWidth = 2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let y = 0; y <= H; y += 8) {
          const c = centerAtWith(s.trackOffset + y, p) + side * p.half;
          if (y === 0) ctx.moveTo(c, y); else ctx.lineTo(c, y);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;

      // dashed center line
      ctx.strokeStyle = theme.dash;
      ctx.setLineDash([12, 14]);
      ctx.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const c = centerAtWith(s.trackOffset + y, p);
        if (y === 0) ctx.moveTo(c, y);
        else ctx.lineTo(c, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // finish line when the goal is close (draws on the road ahead)
      const remaining = level.goal - progress;
      if (remaining < 60) {
        const fy = H - 40 - remaining * 4;
        const c = centerAtWith(s.trackOffset + fy, p);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? "#000" : "#fff";
          ctx.fillRect(c - p.half + (i * (p.half * 2) / 8), fy, (p.half * 2) / 8, 10);
        }
      }

      // car
      ctx.save();
      ctx.translate(s.car.x, s.car.y);
      ctx.rotate(s.car.ang + Math.PI / 2);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-8, -14, 16, 28);
      ctx.fillStyle = "#111";
      ctx.fillRect(-6, -8, 12, 8);
      ctx.restore();

      // HUD
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(8, 8, 190, 44);
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.fillText(`${theme.emoji} ${level.name}`, 16, 24);
      ctx.fillText(`${progress} / ${level.goal}   Spd ${speed.toFixed(1)}`, 16, 42);

      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running, level, userId]);

  const touchBtn = (k: string) => ({
    onTouchStart: () => { stateRef.current.keys[k] = true; },
    onTouchEnd: () => { stateRef.current.keys[k] = false; },
    onMouseDown: () => { stateRef.current.keys[k] = true; },
    onMouseUp: () => { stateRef.current.keys[k] = false; },
    onMouseLeave: () => { stateRef.current.keys[k] = false; },
  });

  const seasons = useMemo(() => ["spring", "summer", "fall", "winter"] as Season[], []);

  if (level == null) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <h1 className="text-2xl font-bold">Poly Racer 🏎️</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          20 levels across four seasons. Same physics — new scenery. First level of each season is unlocked; beat one to unlock the next.
        </p>
        {seasons.map((season) => {
          const t = THEMES[season];
          return (
            <div key={season} className="mt-5">
              <div className="mb-2 text-sm font-semibold">{t.emoji} {t.label}</div>
              <div className="grid grid-cols-5 gap-2">
                {LEVELS.filter((l) => l.season === season).map((l) => {
                  const isUnlocked = unlocked.has(l.id);
                  return (
                    <button
                      key={l.id}
                      disabled={!isUnlocked}
                      onClick={() => start(l.id - 1)}
                      className={`aspect-square rounded-lg border text-sm font-semibold transition-all ${
                        isUnlocked
                          ? "border-primary/40 bg-card hover:-translate-y-0.5 hover:border-primary"
                          : "cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-60"
                      }`}
                      style={isUnlocked ? { boxShadow: `inset 0 -14px 0 ${t.ground}22` } : undefined}
                    >
                      {isUnlocked ? l.id : "🔒"}
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
    <div className="mx-auto max-w-md animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{THEMES[level.season].emoji} {level.name}</h1>
        <Button size="sm" variant="ghost" onClick={() => { setRunning(false); setLevelIdx(null); setDead(false); setWon(false); }}>
          Levels
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Progress: <span className="font-semibold">{score} / {level.goal}</span></div>
        <Button size="sm" variant="secondary" onClick={() => start(level.id - 1)}>
          {running ? "Restart" : won ? "Play again" : dead ? "Try again" : "Start"}
        </Button>
      </div>
      <div className="relative">
        <canvas ref={ref} width={W} height={H} className="mt-4 w-full rounded-xl border border-border" />
        {won && !running && (
          <div className="absolute inset-0 mt-4 flex flex-col items-center justify-center rounded-xl bg-black/60 text-center animate-game-over-in">
            <div className="text-2xl font-bold text-white">Level Complete! 🏁</div>
            <p className="mt-1 text-sm text-white/80">Next level unlocked.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => start(level.id - 1)}>Replay</Button>
              {level.id < 20 && (
                <Button size="sm" variant="secondary" onClick={() => start(level.id)}>Next Level</Button>
              )}
            </div>
          </div>
        )}
        {dead && !running && (
          <div className="absolute inset-0 mt-4 flex flex-col items-center justify-center rounded-xl bg-black/60 text-center animate-game-over-in">
            <div className="text-2xl font-bold text-white">Off the road!</div>
            <Button size="sm" className="mt-3" onClick={() => start(level.id - 1)}>Try again</Button>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 md:hidden">
        <Button variant="secondary" {...touchBtn("ArrowLeft")}>←</Button>
        <Button variant="secondary" {...touchBtn("ArrowUp")}>Gas</Button>
        <Button variant="secondary" {...touchBtn("ArrowDown")}>Brake</Button>
        <Button variant="secondary" {...touchBtn("ArrowRight")}>→</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Steer with ← →, Gas ↑, Brake ↓. Same physics on every track.</p>
    </div>
  );
}
