import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games/polytrack")({
  component: PolyTrack,
});

const W = 480;
const H = 640;

type Season = "spring" | "summer" | "fall" | "winter";

type Theme = {
  ground: string;
  groundAccent: string;
  road: string;
  roadEdge: string;
  dash: string;
  label: string;
  emoji: string;
  // decorative flecks (grass tufts, sand, leaves, snow)
  fleck: string;
};

const THEMES: Record<Season, Theme> = {
  spring: {
    ground: "#1f7a3a",
    groundAccent: "#2b8f47",
    road: "#3a3a44",
    roadEdge: "#e5e7eb",
    dash: "#fde047",
    label: "Spring",
    emoji: "🌱",
    fleck: "#4ade80",
  },
  summer: {
    ground: "#d9b26a",
    groundAccent: "#c99a4d",
    road: "#a88558", // dusty desert road
    roadEdge: "#f4e2b8",
    dash: "#ffffff",
    label: "Summer",
    emoji: "🏜️",
    fleck: "#f5deb3",
  },
  fall: {
    ground: "#7a3e1d",
    groundAccent: "#a35228",
    road: "#3a3a44",
    roadEdge: "#e5e7eb",
    dash: "#fde047",
    label: "Fall",
    emoji: "🍂",
    fleck: "#f97316",
  },
  winter: {
    ground: "#e8eef5",
    groundAccent: "#ffffff",
    road: "#c9d3de", // snowy road
    roadEdge: "#94a3b8",
    dash: "#64748b",
    label: "Winter",
    emoji: "❄️",
    fleck: "#ffffff",
  },
};

type Level = { id: number; season: Season; name: string; goal: number };

const LEVELS: Level[] = Array.from({ length: 20 }, (_, i) => {
  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const season = seasons[Math.floor(i / 5)];
  const withinSeason = (i % 5) + 1;
  const goal = 800 + i * 250; // steadily longer
  return {
    id: i + 1,
    season,
    name: `${THEMES[season].label} ${withinSeason}`,
    goal,
  };
});

function PolyTrack() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [levelIdx, setLevelIdx] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [unlocked, setUnlocked] = useState(1);

  const stateRef = useRef({
    car: { x: W / 2, y: H - 100, vx: 0, vy: 0, ang: -Math.PI / 2 },
    keys: {} as Record<string, boolean>,
    trackOffset: 0,
    seed: 1,
  });

  useEffect(() => {
    const u = Number(localStorage.getItem("dap.polytrack.unlocked") || "1");
    setUnlocked(Math.max(1, Math.min(20, u)));
  }, []);

  const level = levelIdx != null ? LEVELS[levelIdx] : null;

  const start = (idx: number) => {
    stateRef.current.car = { x: W / 2, y: H - 100, vx: 0, vy: 0, ang: -Math.PI / 2 };
    stateRef.current.trackOffset = 0;
    stateRef.current.seed = idx + 7;
    setLevelIdx(idx);
    setScore(0);
    setDead(false);
    setWon(false);
    setRunning(true);
  };

  const centerAt = (y: number, seed: number) => {
    return W / 2 + Math.sin(y * 0.008 + seed * 0.13) * 120 + Math.sin(y * 0.021 + seed) * 40;
  };
  const trackHalfWidth = 70;

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
    let handle: number;

    // Precompute deterministic flecks per level
    const flecks = Array.from({ length: 80 }, (_, i) => ({
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
      const speed = Math.hypot(s.car.vx, s.car.vy);
      const accel = gas * 0.25 - brake * 0.18;
      s.car.vx += Math.cos(s.car.ang) * accel;
      s.car.vy += Math.sin(s.car.ang) * accel;
      s.car.vx *= 0.97; s.car.vy *= 0.97;
      s.car.x += s.car.vx;
      s.trackOffset += -s.car.vy;
      s.car.vy = Math.max(-6, Math.min(6, s.car.vy));

      if (s.car.x < 0 || s.car.x > W) { setRunning(false); setDead(true); return; }

      const worldY = s.trackOffset + s.car.y;
      const cx = centerAt(worldY, s.seed);
      if (Math.abs(s.car.x - cx) > trackHalfWidth) {
        setRunning(false); setDead(true); return;
      }

      const progress = Math.floor(s.trackOffset / 10);
      setScore(progress);

      if (progress >= level.goal) {
        setRunning(false);
        setWon(true);
        const nextUnlock = Math.min(20, level.id + 1);
        setUnlocked((prev) => {
          const v = Math.max(prev, nextUnlock);
          localStorage.setItem("dap.polytrack.unlocked", String(v));
          return v;
        });
        return;
      }

      // === draw ===
      // ground
      ctx.fillStyle = theme.ground;
      ctx.fillRect(0, 0, W, H);
      // scrolling ground flecks for depth
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
        const wy = s.trackOffset + y;
        const c = centerAt(wy, s.seed);
        if (y === 0) ctx.moveTo(c - trackHalfWidth, y);
        else ctx.lineTo(c - trackHalfWidth, y);
      }
      for (let y = H; y >= 0; y -= 8) {
        const wy = s.trackOffset + y;
        const c = centerAt(wy, s.seed);
        ctx.lineTo(c + trackHalfWidth, y);
      }
      ctx.closePath();
      ctx.fill();

      // road edges
      ctx.strokeStyle = theme.roadEdge;
      ctx.lineWidth = 2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let y = 0; y <= H; y += 8) {
          const wy = s.trackOffset + y;
          const c = centerAt(wy, s.seed) + side * trackHalfWidth;
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
        const wy = s.trackOffset + y;
        const c = centerAt(wy, s.seed);
        if (y === 0) ctx.moveTo(c, y);
        else ctx.lineTo(c, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // finish line if close
      const remaining = level.goal - progress;
      if (remaining < 60) {
        const finishScreenY = H - remaining * 10 * 0; // draw ahead visually
        const fy = H - 40 - remaining * 4;
        ctx.fillStyle = "#fff";
        const c = centerAt(s.trackOffset + fy, s.seed);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? "#000" : "#fff";
          ctx.fillRect(c - trackHalfWidth + (i * (trackHalfWidth * 2) / 8), fy, (trackHalfWidth * 2) / 8, 10);
        }
        void finishScreenY;
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
      ctx.fillRect(8, 8, 170, 44);
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.fillText(`${theme.emoji} ${level.name}`, 16, 24);
      ctx.fillText(`${progress} / ${level.goal}   Spd ${speed.toFixed(1)}`, 16, 42);

      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running, level]);

  const touchBtn = (k: string) => ({
    onTouchStart: () => { stateRef.current.keys[k] = true; },
    onTouchEnd: () => { stateRef.current.keys[k] = false; },
    onMouseDown: () => { stateRef.current.keys[k] = true; },
    onMouseUp: () => { stateRef.current.keys[k] = false; },
    onMouseLeave: () => { stateRef.current.keys[k] = false; },
  });

  // Level select screen
  if (level == null) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Poly Racer 🏎️</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          20 levels across four seasons. Same physics — new scenery. Reach the finish line to unlock the next.
        </p>
        {(["spring", "summer", "fall", "winter"] as Season[]).map((season) => {
          const t = THEMES[season];
          return (
            <div key={season} className="mt-5">
              <div className="mb-2 text-sm font-semibold">{t.emoji} {t.label}</div>
              <div className="grid grid-cols-5 gap-2">
                {LEVELS.filter((l) => l.season === season).map((l) => {
                  const locked = l.id > unlocked;
                  return (
                    <button
                      key={l.id}
                      disabled={locked}
                      onClick={() => start(l.id - 1)}
                      className={`aspect-square rounded-lg border text-sm font-semibold transition-all ${
                        locked
                          ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-60"
                          : "border-primary/40 bg-card hover:-translate-y-0.5 hover:border-primary"
                      }`}
                      style={!locked ? { boxShadow: `inset 0 -14px 0 ${t.ground}22` } : undefined}
                    >
                      {locked ? "🔒" : l.id}
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
    <div className="mx-auto max-w-md">
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
          <div className="absolute inset-0 mt-4 flex flex-col items-center justify-center rounded-xl bg-black/60 text-center">
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
          <div className="absolute inset-0 mt-4 flex flex-col items-center justify-center rounded-xl bg-black/60 text-center">
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
