import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";

export const Route = createFileRoute("/games/flappy")({
  component: FlappyGame,
});

type FlapAction = "flap";
const FLAP_DEFAULTS: Record<FlapAction, string[]> = {
  flap: [" ", "ArrowUp", "w"],
};
const FLAP_LABELS: Record<FlapAction, string> = { flap: "Flap" };

const W = 400;
const H = 560;
const GRAVITY = 1400;
const FLAP = -380;
const PIPE_W = 60;
const GAP = 150;
const SPEED = 160;

type Pipe = { x: number; top: number };

function FlappyGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const stateRef = useRef({
    y: H / 2,
    vy: 0,
    pipes: [] as Pipe[],
    spawn: 0,
    lastT: 0,
    passed: new Set<Pipe>(),
  });

  const start = () => {
    stateRef.current = {
      y: H / 2,
      vy: 0,
      pipes: [],
      spawn: 0,
      lastT: 0,
      passed: new Set(),
    };
    setScore(0);
    setDead(false);
    setRunning(true);
  };

  const flap = () => {
    if (!running) {
      start();
      return;
    }
    stateRef.current.vy = FLAP;
  };

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let handle: number;

    const loop = (t: number) => {
      const s = stateRef.current;
      const dt = s.lastT ? Math.min(0.033, (t - s.lastT) / 1000) : 0;
      s.lastT = t;

      s.vy += GRAVITY * dt;
      s.y += s.vy * dt;
      s.spawn -= dt;
      if (s.spawn <= 0) {
        s.spawn = 1.4;
        const top = 60 + Math.random() * (H - GAP - 120);
        s.pipes.push({ x: W + 10, top });
      }
      for (const p of s.pipes) p.x -= SPEED * dt;
      s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10);

      // Collision
      const bx = 80;
      const br = 14;
      if (s.y - br < 0 || s.y + br > H) {
        setRunning(false);
        setDead(true);
        return;
      }
      for (const p of s.pipes) {
        if (bx + br > p.x && bx - br < p.x + PIPE_W) {
          if (s.y - br < p.top || s.y + br > p.top + GAP) {
            setRunning(false);
            setDead(true);
            return;
          }
        }
        if (!s.passed.has(p) && p.x + PIPE_W < bx - br) {
          s.passed.add(p);
          setScore((v) => {
            const nv = v + 1;
            setBest((b) => Math.max(b, nv));
            return nv;
          });
        }
      }

      // Draw
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0ea5e9");
      grad.addColorStop(1, "#1e293b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#22c55e";
      for (const p of s.pipes) {
        ctx.fillRect(p.x, 0, PIPE_W, p.top);
        ctx.fillRect(p.x, p.top + GAP, PIPE_W, H - p.top - GAP);
      }
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(bx, s.y, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.fillRect(bx + 4, s.y - 4, 3, 3);
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(bx + br, s.y);
      ctx.lineTo(bx + br + 8, s.y - 3);
      ctx.lineTo(bx + br + 8, s.y + 3);
      ctx.fill();

      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const controls = useGameControls<FlapAction>("flappy", FLAP_DEFAULTS, {
    preventDefault: true,
    onKeyDown: (action) => {
      if (action === "flap") flap();
    },
  });

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <h1 className="text-2xl font-bold">Flappy 🐤</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Score: <span className="font-semibold">{score}</span> · Best: {best}</div>
        <Button size="sm" variant="secondary" onClick={start}>
          {running ? "Restart" : dead ? "Play again" : "Start"}
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={flap}
        className="mt-4 w-full cursor-pointer touch-none rounded-xl border border-border"
      />
      <div className="mt-4 md:hidden">
        <Button variant="secondary" className="w-full" onClick={flap}>Flap</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Tap, click, or press the flap key to fly.
      </p>
      <KeybindEditor controls={controls} labels={FLAP_LABELS} />
    </div>
  );
}
