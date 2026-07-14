import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games/river")({
  component: RiverGame,
});

const COLS = 11;
const ROWS = 14;
const CELL = 36;

type Lane = {
  y: number;
  type: "grass" | "road" | "water";
  speed: number; // cells per second (signed)
  gap: number; // spacing between objects (cells)
  offset: number; // current offset in cells
  len: number; // length of each obstacle (cars) or log
};

function buildLanes(): Lane[] {
  const lanes: Lane[] = [];
  for (let y = 0; y < ROWS; y++) {
    if (y === ROWS - 1 || y === 0) {
      lanes.push({ y, type: "grass", speed: 0, gap: 0, offset: 0, len: 0 });
      continue;
    }
    const roll = Math.random();
    if (roll < 0.15) {
      lanes.push({ y, type: "grass", speed: 0, gap: 0, offset: 0, len: 0 });
    } else if (roll < 0.6) {
      lanes.push({
        y,
        type: "road",
        speed: (Math.random() * 2 + 1.5) * (Math.random() < 0.5 ? -1 : 1),
        gap: Math.floor(Math.random() * 3) + 3,
        offset: Math.random() * COLS,
        len: 2,
      });
    } else {
      lanes.push({
        y,
        type: "water",
        speed: (Math.random() * 1.5 + 1) * (Math.random() < 0.5 ? -1 : 1),
        gap: Math.floor(Math.random() * 2) + 2,
        offset: Math.random() * COLS,
        len: Math.floor(Math.random() * 2) + 2,
      });
    }
  }
  return lanes;
}

function RiverGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const stateRef = useRef({
    px: 5,
    py: ROWS - 1,
    lanes: buildLanes(),
    onLogOffset: 0,
    lastT: 0,
  });

  const start = () => {
    stateRef.current = {
      px: 5,
      py: ROWS - 1,
      lanes: buildLanes(),
      onLogOffset: 0,
      lastT: 0,
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

    const draw = (t: number) => {
      const s = stateRef.current;
      const dt = s.lastT ? (t - s.lastT) / 1000 : 0;
      s.lastT = t;

      // Advance lane offsets
      for (const l of s.lanes) l.offset = (l.offset + l.speed * dt + COLS * 100) % COLS;

      // If on water, ride the log
      const currentLane = s.lanes[s.py];
      if (currentLane?.type === "water") {
        s.px += currentLane.speed * dt;
      }

      // Death checks
      const cell = s.lanes[s.py];
      if (cell) {
        if (cell.type === "road") {
          // Check car overlap
          for (let i = 0; i < COLS + cell.gap; i += cell.gap + cell.len) {
            const carX = ((i + cell.offset) % COLS + COLS) % COLS;
            if (s.px + 0.6 > carX && s.px + 0.4 < carX + cell.len) {
              setRunning(false);
              setDead(true);
              return;
            }
          }
        } else if (cell.type === "water") {
          // Must be on a log
          let onLog = false;
          for (let i = 0; i < COLS + cell.gap; i += cell.gap + cell.len) {
            const logX = ((i + cell.offset) % COLS + COLS) % COLS;
            if (s.px + 0.5 >= logX && s.px + 0.5 <= logX + cell.len) {
              onLog = true;
              break;
            }
          }
          if (!onLog) {
            setRunning(false);
            setDead(true);
            return;
          }
        }
      }
      if (s.px < -0.5 || s.px > COLS - 0.5) {
        setRunning(false);
        setDead(true);
        return;
      }

      // Draw
      for (let y = 0; y < ROWS; y++) {
        const l = s.lanes[y];
        let color = "#22c55e";
        if (l.type === "road") color = "#374151";
        else if (l.type === "water") color = "#1e3a8a";
        ctx.fillStyle = color;
        ctx.fillRect(0, y * CELL, COLS * CELL, CELL);
        if (l.type === "road") {
          ctx.strokeStyle = "#facc15";
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.moveTo(0, y * CELL + CELL / 2);
          ctx.lineTo(COLS * CELL, y * CELL + CELL / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          // cars
          ctx.fillStyle = "#f87171";
          for (let i = 0; i < COLS + l.gap; i += l.gap + l.len) {
            const x = ((i + l.offset) % COLS + COLS) % COLS;
            ctx.fillRect(x * CELL + 2, y * CELL + 6, l.len * CELL - 4, CELL - 12);
          }
        } else if (l.type === "water") {
          ctx.fillStyle = "#92400e";
          for (let i = 0; i < COLS + l.gap; i += l.gap + l.len) {
            const x = ((i + l.offset) % COLS + COLS) % COLS;
            ctx.fillRect(x * CELL + 1, y * CELL + 4, l.len * CELL - 2, CELL - 8);
          }
        }
      }

      // Frog
      ctx.fillStyle = "#a3e635";
      ctx.beginPath();
      ctx.arc(s.px * CELL + CELL / 2, s.py * CELL + CELL / 2, CELL / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.fillRect(s.px * CELL + 10, s.py * CELL + 10, 4, 4);
      ctx.fillRect(s.px * CELL + CELL - 14, s.py * CELL + 10, 4, 4);

      handle = requestAnimationFrame(draw);
    };
    handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const move = (dx: number, dy: number) => {
    if (!running) return;
    const s = stateRef.current;
    const nx = Math.round(s.px) + dx;
    const ny = s.py + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    s.px = nx;
    s.py = ny;
    if (dy < 0) {
      setScore((v) => {
        const nv = v + 1;
        setBest((b) => Math.max(b, nv));
        return nv;
      });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") move(0, -1);
      else if (e.key === "ArrowDown" || e.key === "s") move(0, 1);
      else if (e.key === "ArrowLeft" || e.key === "a") move(-1, 0);
      else if (e.key === "ArrowRight" || e.key === "d") move(1, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <h1 className="text-2xl font-bold">River Crosser 🐸</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Score: <span className="font-semibold">{score}</span> · Best: {best}</div>
        <Button size="sm" variant="secondary" onClick={start}>
          {running ? "Restart" : dead ? "Play again" : "Start"}
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={COLS * CELL}
        height={ROWS * CELL}
        className="mt-4 w-full rounded-xl border border-border transition-shadow hover:shadow-lg"
      />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div />
        <Button variant="secondary" onClick={() => move(0, -1)}>↑</Button>
        <div />
        <Button variant="secondary" onClick={() => move(-1, 0)}>←</Button>
        <Button variant="secondary" onClick={() => move(0, 1)}>↓</Button>
        <Button variant="secondary" onClick={() => move(1, 0)}>→</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Hop across roads and rivers. Ride logs, dodge cars. Arrow keys or WASD.
      </p>
    </div>
  );
}
