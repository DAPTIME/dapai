import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";

type SpaceAction = "left" | "right" | "thrust" | "fire";
const SPACE_DEFAULTS: Record<SpaceAction, string[]> = {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  thrust: ["ArrowUp", "w"],
  fire: [" ", "Enter"],
};
const SPACE_LABELS: Record<SpaceAction, string> = {
  left: "Rotate left",
  right: "Rotate right",
  thrust: "Thrust",
  fire: "Fire",
};

export const Route = createFileRoute("/games/spacewar")({
  component: Spacewar,
});

const W = 480;
const H = 640;

type V = { x: number; y: number };
type Ship = V & { vx: number; vy: number; ang: number };
type Bullet = V & { vx: number; vy: number; life: number };
type Rock = V & { vx: number; vy: number; r: number };

function Spacewar() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const [running, setRunning] = useState(false);
  const stateRef = useRef<{
    ship: Ship;
    bullets: Bullet[];
    rocks: Rock[];
  }>({
    ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, ang: -Math.PI / 2 },
    bullets: [],
    rocks: [],
  });

  const controls = useGameControls<SpaceAction>("spacewar", SPACE_DEFAULTS, { preventDefault: true });

  const spawnRock = (): Rock => {
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) { x = Math.random() * W; y = -20; }
    else if (side === 1) { x = W + 20; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = H + 20; }
    else { x = -20; y = Math.random() * H; }
    const angle = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - 0.5);
    const sp = 0.8 + Math.random() * 1.2;
    return { x, y, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp, r: 14 + Math.random() * 16 };
  };

  const start = () => {
    stateRef.current.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, ang: -Math.PI / 2 };
    stateRef.current.bullets = [];
    stateRef.current.rocks = Array.from({ length: 4 }, spawnRock);
    setScore(0);
    setDead(false);
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let handle: number;
    let shootCd = 0;
    let spawnCd = 0;
    const loop = () => {
      const s = stateRef.current;
      const k = controls.pressed.current;
      // input
      if (k.left) s.ship.ang -= 0.08;
      if (k.right) s.ship.ang += 0.08;
      if (k.thrust) {
        s.ship.vx += Math.cos(s.ship.ang) * 0.15;
        s.ship.vy += Math.sin(s.ship.ang) * 0.15;
      }
      if (k.fire && shootCd <= 0) {
        s.bullets.push({
          x: s.ship.x, y: s.ship.y,
          vx: Math.cos(s.ship.ang) * 6 + s.ship.vx,
          vy: Math.sin(s.ship.ang) * 6 + s.ship.vy,
          life: 70,
        });
        shootCd = 12;
      }
      shootCd--;
      spawnCd--;
      if (spawnCd <= 0) { s.rocks.push(spawnRock()); spawnCd = 90; }
      // physics
      s.ship.vx *= 0.99; s.ship.vy *= 0.99;
      s.ship.x = (s.ship.x + s.ship.vx + W) % W;
      s.ship.y = (s.ship.y + s.ship.vy + H) % H;
      s.bullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
      s.bullets = s.bullets.filter((b) => b.life > 0 && b.x > 0 && b.x < W && b.y > 0 && b.y < H);
      s.rocks.forEach((r) => { r.x += r.vx; r.y += r.vy; });
      s.rocks = s.rocks.filter((r) => r.x > -40 && r.x < W + 40 && r.y > -40 && r.y < H + 40);
      // collisions
      for (const r of [...s.rocks]) {
        for (const b of [...s.bullets]) {
          if (Math.hypot(r.x - b.x, r.y - b.y) < r.r) {
            s.rocks = s.rocks.filter((x) => x !== r);
            s.bullets = s.bullets.filter((x) => x !== b);
            setScore((n) => n + 10);
            break;
          }
        }
        if (Math.hypot(r.x - s.ship.x, r.y - s.ship.y) < r.r + 8) {
          setRunning(false); setDead(true); return;
        }
      }
      // draw
      ctx.fillStyle = "#05050c";
      ctx.fillRect(0, 0, W, H);
      // stars
      ctx.fillStyle = "#334";
      for (let i = 0; i < 40; i++) {
        ctx.fillRect((i * 53) % W, (i * 91) % H, 1, 1);
      }
      // ship
      ctx.save();
      ctx.translate(s.ship.x, s.ship.y);
      ctx.rotate(s.ship.ang);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.lineTo(-8, 7); ctx.lineTo(-4, 0); ctx.lineTo(-8, -7); ctx.closePath();
      ctx.stroke();
      ctx.restore();
      // bullets
      ctx.fillStyle = "#fde047";
      s.bullets.forEach((b) => ctx.fillRect(b.x - 1, b.y - 1, 2, 2));
      // rocks
      ctx.strokeStyle = "#a78bfa";
      s.rocks.forEach((r) => {
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const touchBtn = (a: SpaceAction) => ({
    onTouchStart: () => controls.press(a, true),
    onTouchEnd: () => controls.press(a, false),
    onMouseDown: () => controls.press(a, true),
    onMouseUp: () => controls.press(a, false),
    onMouseLeave: () => controls.press(a, false),
  });

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <h1 className="text-2xl font-bold">Spacewar 🚀</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Score: <span className="font-semibold">{score}</span></div>
        <Button size="sm" variant="secondary" onClick={start}>{running ? "Restart" : dead ? "Play again" : "Start"}</Button>
      </div>
      <canvas ref={ref} width={W} height={H} className="mt-4 w-full rounded-xl border border-border transition-shadow hover:shadow-lg" />
      <div className="mt-4 grid grid-cols-4 gap-2 md:hidden">
        <Button variant="secondary" {...touchBtn("left")}>←</Button>
        <Button variant="secondary" {...touchBtn("thrust")}>Thrust</Button>
        <Button variant="secondary" {...touchBtn("right")}>→</Button>
        <Button variant="secondary" {...touchBtn("fire")}>Fire</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Steer, thrust, and fire. Screen wraps.
      </p>
      <KeybindEditor controls={controls} labels={SPACE_LABELS} />
    </div>
  );
}
