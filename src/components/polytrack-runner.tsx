// Reusable Poly Racer runner. Same physics/renderer for built-in and custom tracks.
// Reports millisecond finish time via onFinish.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { W, H, THEMES, centerAt, formatMs, type Season } from "@/lib/polytrack-engine";
import type { TrackParams } from "@/lib/track-validation";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";

type PolyAction = "left" | "right" | "gas" | "brake";
const POLY_DEFAULTS: Record<PolyAction, string[]> = {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  gas: ["ArrowUp", "w"],
  brake: ["ArrowDown", "s"],
};
const POLY_LABELS: Record<PolyAction, string> = {
  left: "Steer left",
  right: "Steer right",
  gas: "Gas",
  brake: "Brake",
};

type Props = {
  params: TrackParams;
  season: Season;
  goal: number;
  title: string;
  onFinish?: (timeMs: number) => void;
  onExit?: () => void;
  exitLabel?: string;
};

export function PolyTrackRunner({ params, season, goal, title, onFinish, onExit, exitLabel }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const stateRef = useRef({
    car: { x: W / 2, y: H - 100, vx: 0, vy: 0, ang: -Math.PI / 2 },
    trackOffset: 0,
    startTs: 0,
    moved: false,
  });

  const controls = useGameControls<PolyAction>("polytrack", POLY_DEFAULTS);

  const start = useCallback(() => {
    const spawnY = H - 100;
    const cx = centerAt(spawnY, params);
    stateRef.current.car = { x: cx, y: spawnY, vx: 0, vy: 0, ang: -Math.PI / 2 };
    stateRef.current.trackOffset = 0;
    stateRef.current.startTs = 0;
    stateRef.current.moved = false;
    setScore(0);
    setElapsed(0);
    setDead(false);
    setWon(false);
    setRunning(true);
  }, [params]);

  useEffect(() => {
    if (!running) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const theme = THEMES[season];
    const p = params;
    let handle = 0;

    const flecks = Array.from({ length: 90 }, (_, i) => ({
      x: (i * 97) % W,
      y: (i * 53) % H,
      r: 1 + ((i * 7) % 3),
    }));

    const loop = () => {
      const s = stateRef.current;
      const k = controls.pressed.current;
      const turning = (k.left ? -1 : 0) + (k.right ? 1 : 0);
      const gas = k.gas ? 1 : 0;
      const brake = k.brake ? 1 : 0;

      s.car.ang += turning * 0.05;
      const accel = gas * 0.25 - brake * 0.18;
      s.car.vx += Math.cos(s.car.ang) * accel;
      s.car.vy += Math.sin(s.car.ang) * accel;
      s.car.vx *= 0.97; s.car.vy *= 0.97;
      s.car.x += s.car.vx;
      s.trackOffset += -s.car.vy;
      s.car.vy = Math.max(-6, Math.min(6, s.car.vy));
      const speed = Math.hypot(s.car.vx, s.car.vy);

      // Start timer on first meaningful movement.
      if (!s.moved && (gas || brake || turning)) {
        s.moved = true;
        s.startTs = performance.now();
      }
      if (s.moved) setElapsed(performance.now() - s.startTs);

      if (s.car.x < 0 || s.car.x > W) { setRunning(false); setDead(true); return; }

      const worldY = s.trackOffset + s.car.y;
      const cx = centerAt(worldY, p);
      if (Math.abs(s.car.x - cx) > p.half) { setRunning(false); setDead(true); return; }

      const progress = Math.max(0, Math.floor(s.trackOffset / 10));
      setScore(progress);

      if (progress >= goal) {
        const finalMs = s.moved ? performance.now() - s.startTs : 0;
        setElapsed(finalMs);
        setRunning(false);
        setWon(true);
        onFinish?.(Math.max(500, Math.round(finalMs)));
        return;
      }

      ctx.fillStyle = theme.ground;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = theme.fleck;
      const scroll = s.trackOffset % H;
      for (const f of flecks) {
        const y = (f.y + scroll) % H;
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(f.x, y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = theme.road;
      ctx.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const c = centerAt(s.trackOffset + y, p);
        if (y === 0) ctx.moveTo(c - p.half, y);
        else ctx.lineTo(c - p.half, y);
      }
      for (let y = H; y >= 0; y -= 8) {
        const c = centerAt(s.trackOffset + y, p);
        ctx.lineTo(c + p.half, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = theme.roadEdge;
      ctx.lineWidth = 2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let y = 0; y <= H; y += 8) {
          const c = centerAt(s.trackOffset + y, p) + side * p.half;
          if (y === 0) ctx.moveTo(c, y); else ctx.lineTo(c, y);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;

      ctx.strokeStyle = theme.dash;
      ctx.setLineDash([12, 14]);
      ctx.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const c = centerAt(s.trackOffset + y, p);
        if (y === 0) ctx.moveTo(c, y);
        else ctx.lineTo(c, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const remaining = goal - progress;
      if (remaining < 60) {
        const fy = H - 40 - remaining * 4;
        const c = centerAt(s.trackOffset + fy, p);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? "#000" : "#fff";
          ctx.fillRect(c - p.half + (i * (p.half * 2) / 8), fy, (p.half * 2) / 8, 10);
        }
      }

      ctx.save();
      ctx.translate(s.car.x, s.car.y);
      ctx.rotate(s.car.ang + Math.PI / 2);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-8, -14, 16, 28);
      ctx.fillStyle = "#111";
      ctx.fillRect(-6, -8, 12, 8);
      ctx.restore();

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(8, 8, 220, 44);
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.fillText(`${theme.emoji} ${title}`, 16, 24);
      ctx.fillText(`${progress}/${goal}   ${formatMs(s.moved ? performance.now() - s.startTs : 0)}   Spd ${speed.toFixed(1)}`, 16, 42);

      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running, params, season, goal, title, onFinish]);

  const touchBtn = (k: string) => ({
    onTouchStart: () => { stateRef.current.keys[k] = true; },
    onTouchEnd: () => { stateRef.current.keys[k] = false; },
    onMouseDown: () => { stateRef.current.keys[k] = true; },
    onMouseUp: () => { stateRef.current.keys[k] = false; },
    onMouseLeave: () => { stateRef.current.keys[k] = false; },
  });

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{THEMES[season].emoji} {title}</h1>
        {onExit && (
          <Button size="sm" variant="ghost" onClick={onExit}>{exitLabel ?? "Back"}</Button>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Progress: <span className="font-semibold">{score} / {goal}</span> · <span className="font-mono">{formatMs(elapsed)}</span></div>
        <Button size="sm" variant="secondary" onClick={start}>
          {running ? "Restart" : won ? "Play again" : dead ? "Try again" : "Start"}
        </Button>
      </div>
      <div className="relative">
        <canvas ref={ref} width={W} height={H} className="mt-4 w-full rounded-xl border border-border" />
        {won && !running && (
          <div className="absolute inset-0 mt-4 flex flex-col items-center justify-center rounded-xl bg-black/60 text-center animate-game-over-in">
            <div className="text-2xl font-bold text-white">Finish! 🏁</div>
            <p className="mt-1 text-sm text-white/80 font-mono">{formatMs(elapsed)}</p>
            <Button size="sm" className="mt-3" onClick={start}>Play again</Button>
          </div>
        )}
        {dead && !running && (
          <div className="absolute inset-0 mt-4 flex flex-col items-center justify-center rounded-xl bg-black/60 text-center animate-game-over-in">
            <div className="text-2xl font-bold text-white">Off the road!</div>
            <Button size="sm" className="mt-3" onClick={start}>Try again</Button>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 md:hidden">
        <Button variant="secondary" {...touchBtn("ArrowLeft")}>←</Button>
        <Button variant="secondary" {...touchBtn("ArrowUp")}>Gas</Button>
        <Button variant="secondary" {...touchBtn("ArrowDown")}>Brake</Button>
        <Button variant="secondary" {...touchBtn("ArrowRight")}>→</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Steer with ← →, Gas ↑, Brake ↓. Timer starts on your first move.</p>
    </div>
  );
}
