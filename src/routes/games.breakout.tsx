import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";

export const Route = createFileRoute("/games/breakout")({
  component: BreakoutGame,
});

type BreakAction = "left" | "right" | "launch";
const BREAK_DEFAULTS: Record<BreakAction, string[]> = {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  launch: [" ", "Enter"],
};
const BREAK_LABELS: Record<BreakAction, string> = {
  left: "Nudge left",
  right: "Nudge right",
  launch: "Launch ball",
};

const W = 480;
const H = 560;
const PADDLE_W = 90;
const PADDLE_H = 12;
const BALL_R = 7;
const ROWS = 6;
const COLS = 9;
const BRICK_W = 46;
const BRICK_H = 18;
const BRICK_PAD = 6;
const BRICK_TOP = 50;
const BRICK_LEFT = (W - (COLS * (BRICK_W + BRICK_PAD) - BRICK_PAD)) / 2;

type Brick = { x: number; y: number; alive: boolean; hue: number };

function makeBricks(): Brick[] {
  const arr: Brick[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      arr.push({
        x: BRICK_LEFT + c * (BRICK_W + BRICK_PAD),
        y: BRICK_TOP + r * (BRICK_H + BRICK_PAD),
        alive: true,
        hue: (r * 45 + 200) % 360,
      });
    }
  }
  return arr;
}

function BreakoutGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState<null | "win" | "lose">(null);
  const stateRef = useRef({
    px: W / 2,
    bx: W / 2,
    by: H - 40,
    vx: 220,
    vy: -260,
    bricks: makeBricks(),
    lastT: 0,
    launched: false,
  });

  const start = () => {
    stateRef.current = {
      px: W / 2,
      bx: W / 2,
      by: H - 40,
      vx: 220 * (Math.random() < 0.5 ? -1 : 1),
      vy: -260,
      bricks: makeBricks(),
      lastT: 0,
      launched: false,
    };
    setScore(0);
    setLives(3);
    setOver(null);
    setRunning(true);
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

      if (!s.launched) {
        s.bx = s.px;
        s.by = H - 40;
      } else {
        s.bx += s.vx * dt;
        s.by += s.vy * dt;
        if (s.bx < BALL_R) { s.bx = BALL_R; s.vx *= -1; }
        if (s.bx > W - BALL_R) { s.bx = W - BALL_R; s.vx *= -1; }
        if (s.by < BALL_R) { s.by = BALL_R; s.vy *= -1; }
        // Paddle
        const py = H - 30;
        if (s.by + BALL_R > py && s.by + BALL_R < py + PADDLE_H + 10 &&
            s.bx > s.px - PADDLE_W / 2 && s.bx < s.px + PADDLE_W / 2 && s.vy > 0) {
          s.vy = -Math.abs(s.vy);
          const off = (s.bx - s.px) / (PADDLE_W / 2);
          s.vx = 260 * off;
        }
        // Bricks
        for (const b of s.bricks) {
          if (!b.alive) continue;
          if (s.bx + BALL_R > b.x && s.bx - BALL_R < b.x + BRICK_W &&
              s.by + BALL_R > b.y && s.by - BALL_R < b.y + BRICK_H) {
            b.alive = false;
            setScore((v) => v + 10);
            // Reflect based on overlap
            const overlapX = Math.min(s.bx + BALL_R - b.x, b.x + BRICK_W - (s.bx - BALL_R));
            const overlapY = Math.min(s.by + BALL_R - b.y, b.y + BRICK_H - (s.by - BALL_R));
            if (overlapX < overlapY) s.vx *= -1;
            else s.vy *= -1;
            break;
          }
        }
        if (s.bricks.every((b) => !b.alive)) {
          setRunning(false);
          setOver("win");
          return;
        }
        if (s.by > H + 20) {
          setLives((l) => {
            const nl = l - 1;
            if (nl <= 0) {
              setRunning(false);
              setOver("lose");
            } else {
              s.launched = false;
              s.bx = s.px;
              s.by = H - 40;
              s.vx = 220 * (Math.random() < 0.5 ? -1 : 1);
              s.vy = -260;
            }
            return nl;
          });
        }
      }

      // Draw
      ctx.fillStyle = "#0b0b12";
      ctx.fillRect(0, 0, W, H);
      for (const b of s.bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = `hsl(${b.hue} 80% 55%)`;
        ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
      }
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(s.px - PADDLE_W / 2, H - 30, PADDLE_W, PADDLE_H);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(s.bx, s.by, BALL_R, 0, Math.PI * 2);
      ctx.fill();

      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const controls = useGameControls<BreakAction>("breakout", BREAK_DEFAULTS, {
    preventDefault: true,
    onKeyDown: (action) => {
      if (action === "launch") stateRef.current.launched = true;
      else if (action === "left")
        stateRef.current.px = Math.max(PADDLE_W / 2, stateRef.current.px - 24);
      else if (action === "right")
        stateRef.current.px = Math.min(W - PADDLE_W / 2, stateRef.current.px + 24);
    },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * W;
      stateRef.current.px = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, x));
    };
    const onPointer = (e: PointerEvent) => onMove(e.clientX);
    const onClick = () => { stateRef.current.launched = true; };
    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerdown", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onClick);
    };
  }, [running]);

  const touchBtn = (a: BreakAction) => ({
    onTouchStart: () => controls.press(a, true),
    onTouchEnd: () => controls.press(a, false),
    onMouseDown: () => controls.press(a, true),
    onMouseUp: () => controls.press(a, false),
    onMouseLeave: () => controls.press(a, false),
  });

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <h1 className="text-2xl font-bold">Brick Breaker 🧱</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Score: <span className="font-semibold">{score}</span> · Lives: {lives}</div>
        <Button size="sm" variant="secondary" onClick={start}>
          {running ? "Restart" : over ? "Play again" : "Start"}
        </Button>
      </div>
      {over && (
        <div className="mt-2 text-sm text-muted-foreground">
          {over === "win" ? "You cleared the board! 🎉" : "Game over."}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="mt-4 w-full touch-none rounded-xl border border-border"
      />
      <div className="mt-4 grid grid-cols-3 gap-2 md:hidden">
        <Button variant="secondary" onClick={() => { stateRef.current.px = Math.max(PADDLE_W / 2, stateRef.current.px - 32); }}>←</Button>
        <Button variant="secondary" onClick={() => { stateRef.current.launched = true; }}>Launch</Button>
        <Button variant="secondary" onClick={() => { stateRef.current.px = Math.min(W - PADDLE_W / 2, stateRef.current.px + 32); }}>→</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Drag or use keys to move. Tap Launch or press Space to release the ball.
      </p>
      <KeybindEditor controls={controls} labels={BREAK_LABELS} />
    </div>
  );
}
