import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";

export const Route = createFileRoute("/games/snake")({
  component: SnakeGame,
});

type SnakeAction = "up" | "down" | "left" | "right";
const SNAKE_DEFAULTS: Record<SnakeAction, string[]> = {
  up: ["ArrowUp", "w"],
  down: ["ArrowDown", "s"],
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
};
const SNAKE_LABELS: Record<SnakeAction, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
};

const COLS = 20;
const ROWS = 20;
const CELL = 20;

type Pt = { x: number; y: number };

function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const stateRef = useRef({
    snake: [{ x: 10, y: 10 }] as Pt[],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: { x: 5, y: 5 } as Pt,
  });

  const start = () => {
    stateRef.current = {
      snake: [{ x: 10, y: 10 }],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      food: { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) },
    };
    setScore(0);
    setDead(false);
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let handle: number;
    let last = 0;
    const step = (t: number) => {
      if (!last) last = t;
      if (t - last > 110) {
        last = t;
        const s = stateRef.current;
        s.dir = s.nextDir;
        const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
            s.snake.some((p) => p.x === head.x && p.y === head.y)) {
          setRunning(false);
          setDead(true);
          return;
        }
        s.snake.unshift(head);
        if (head.x === s.food.x && head.y === s.food.y) {
          setScore((n) => n + 1);
          s.food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
        } else {
          s.snake.pop();
        }
      }
      // Draw
      ctx.fillStyle = "#0b0b12";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const s = stateRef.current;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(s.food.x * CELL, s.food.y * CELL, CELL - 1, CELL - 1);
      s.snake.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? "#22c55e" : "#16a34a";
        ctx.fillRect(p.x * CELL, p.y * CELL, CELL - 1, CELL - 1);
      });
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const turn = (dx: number, dy: number) => {
    const s = stateRef.current;
    if (dx && s.dir.x === -dx) return;
    if (dy && s.dir.y === -dy) return;
    s.nextDir = { x: dx, y: dy };
  };

  useGameControls<SnakeAction>("snake", SNAKE_DEFAULTS, {
    onKeyDown: (action) => {
      if (action === "up") turn(0, -1);
      else if (action === "down") turn(0, 1);
      else if (action === "left") turn(-1, 0);
      else if (action === "right") turn(1, 0);
    },
  });
  // Keep a separate hook instance for the editor UI on desktop.
  const controls = useGameControls<SnakeAction>("snake", SNAKE_DEFAULTS);

  const turn = (dx: number, dy: number) => {
    const s = stateRef.current;
    if (dx && s.dir.x === -dx) return;
    if (dy && s.dir.y === -dy) return;
    s.nextDir = { x: dx, y: dy };
  };

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <h1 className="text-2xl font-bold">Snake 🐍</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Score: <span className="font-semibold">{score}</span></div>
        <Button size="sm" variant="secondary" onClick={start}>{running ? "Restart" : dead ? "Play again" : "Start"}</Button>
      </div>
      <canvas
        ref={canvasRef}
        width={COLS * CELL}
        height={ROWS * CELL}
        className="mt-4 w-full rounded-xl border border-border bg-black"
      />
      <div className="mt-4 grid grid-cols-3 gap-2 md:hidden">
        <div />
        <Button variant="secondary" onClick={() => turn(0, -1)}>↑</Button>
        <div />
        <Button variant="secondary" onClick={() => turn(-1, 0)}>←</Button>
        <Button variant="secondary" onClick={() => turn(0, 1)}>↓</Button>
        <Button variant="secondary" onClick={() => turn(1, 0)}>→</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Arrow keys on desktop, buttons on mobile.</p>
    </div>
  );
}
