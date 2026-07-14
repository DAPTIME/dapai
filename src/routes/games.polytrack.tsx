import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Simple top-down low-poly racer: stay on the winding track, avoid the grass.
export const Route = createFileRoute("/games/polytrack")({
  component: PolyTrack,
});

const W = 480;
const H = 640;

function PolyTrack() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const stateRef = useRef({
    car: { x: W / 2, y: H - 100, vx: 0, vy: 0, ang: -Math.PI / 2 },
    keys: {} as Record<string, boolean>,
    trackOffset: 0,
    seed: Math.floor(Math.random() * 10000),
  });

  useEffect(() => {
    const b = Number(localStorage.getItem("dap.polytrack.best") || "0");
    setBest(b);
  }, []);

  const start = () => {
    stateRef.current.car = { x: W / 2, y: H - 100, vx: 0, vy: 0, ang: -Math.PI / 2 };
    stateRef.current.trackOffset = 0;
    stateRef.current.seed = Math.floor(Math.random() * 10000);
    setScore(0);
    setDead(false);
    setRunning(true);
  };

  // Track center at a given world-Y (higher Y = further ahead). Sine curve.
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
    if (!running) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let handle: number;
    const loop = () => {
      const s = stateRef.current;
      // input
      const k = s.keys;
      const turning = (k["ArrowLeft"] || k["a"] ? -1 : 0) + (k["ArrowRight"] || k["d"] ? 1 : 0);
      const gas = (k["ArrowUp"] || k["w"]) ? 1 : 0;
      const brake = (k["ArrowDown"] || k["s"]) ? 1 : 0;
      s.car.ang += turning * 0.05;
      const speed = Math.hypot(s.car.vx, s.car.vy);
      const accel = gas * 0.25 - brake * 0.18;
      s.car.vx += Math.cos(s.car.ang) * accel;
      s.car.vy += Math.sin(s.car.ang) * accel;
      s.car.vx *= 0.97; s.car.vy *= 0.97;
      s.car.x += s.car.vx;
      // Instead of moving car in Y, scroll the world.
      s.trackOffset += -s.car.vy;
      s.car.vy = Math.max(-6, Math.min(6, s.car.vy));

      // Keep car onscreen X
      if (s.car.x < 0 || s.car.x > W) { setRunning(false); setDead(true); return; }

      // Check on-track at car y
      const worldY = s.trackOffset + s.car.y;
      const cx = centerAt(worldY, s.seed);
      if (Math.abs(s.car.x - cx) > trackHalfWidth) {
        setRunning(false); setDead(true); return;
      }

      setScore(Math.floor(s.trackOffset / 10));

      // draw
      ctx.fillStyle = "#1a4d2e"; // grass
      ctx.fillRect(0, 0, W, H);
      // track ribbon
      ctx.fillStyle = "#2a2a34";
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
      // dashed line
      ctx.strokeStyle = "#fde047";
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
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(8, 8, 96, 28);
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.fillText(`Speed ${speed.toFixed(1)}`, 16, 26);

      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      localStorage.setItem("dap.polytrack.best", String(score));
    }
  }, [score, best]);

  const touchBtn = (k: string) => ({
    onTouchStart: () => { stateRef.current.keys[k] = true; },
    onTouchEnd: () => { stateRef.current.keys[k] = false; },
    onMouseDown: () => { stateRef.current.keys[k] = true; },
    onMouseUp: () => { stateRef.current.keys[k] = false; },
    onMouseLeave: () => { stateRef.current.keys[k] = false; },
  });

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Poly Racer 🏎️</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Score: <span className="font-semibold">{score}</span></div>
        <div>Best: <span className="font-semibold">{best}</span></div>
        <Button size="sm" variant="secondary" onClick={start}>{running ? "Restart" : dead ? "Play again" : "Start"}</Button>
      </div>
      <canvas ref={ref} width={W} height={H} className="mt-4 w-full rounded-xl border border-border" />
      <div className="mt-4 grid grid-cols-4 gap-2 md:hidden">
        <Button variant="secondary" {...touchBtn("ArrowLeft")}>←</Button>
        <Button variant="secondary" {...touchBtn("ArrowUp")}>Gas</Button>
        <Button variant="secondary" {...touchBtn("ArrowDown")}>Brake</Button>
        <Button variant="secondary" {...touchBtn("ArrowRight")}>→</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Steer with ← →, Gas ↑, Brake ↓. Stay on the road.</p>
    </div>
  );
}
