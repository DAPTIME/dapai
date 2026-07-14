import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games/2048")({
  component: Game2048,
});

type Grid = number[][];

const SIZE = 4;

function empty(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function addRandom(g: Grid): Grid {
  const spots: [number, number][] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (g[r][c] === 0) spots.push([r, c]);
  if (!spots.length) return g;
  const [r, c] = spots[Math.floor(Math.random() * spots.length)];
  const ng = g.map((row) => row.slice());
  ng[r][c] = Math.random() < 0.9 ? 2 : 4;
  return ng;
}

function slide(row: number[]): { row: number[]; gained: number } {
  const arr = row.filter((n) => n !== 0);
  let gained = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] === arr[i + 1]) {
      arr[i] *= 2;
      gained += arr[i];
      arr.splice(i + 1, 1);
    }
  }
  while (arr.length < SIZE) arr.push(0);
  return { row: arr, gained };
}

function rotate(g: Grid): Grid {
  const ng = empty();
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) ng[c][SIZE - 1 - r] = g[r][c];
  return ng;
}

function move(g: Grid, dir: "left" | "right" | "up" | "down"): { grid: Grid; gained: number; moved: boolean } {
  let rot = 0;
  if (dir === "up") rot = 1;
  else if (dir === "right") rot = 2;
  else if (dir === "down") rot = 3;
  let ng = g;
  for (let i = 0; i < rot; i++) ng = rotate(ng);
  let gained = 0;
  const next = ng.map((row) => {
    const { row: nr, gained: gg } = slide(row);
    gained += gg;
    return nr;
  });
  for (let i = 0; i < (4 - rot) % 4; i++) {
    let out = empty();
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) out[c][SIZE - 1 - r] = next[r][c];
    next.splice(0, next.length, ...out);
  }
  const moved = JSON.stringify(g) !== JSON.stringify(next);
  return { grid: next, gained, moved };
}

const TILE_COLORS: Record<number, string> = {
  0: "bg-muted/40",
  2: "bg-amber-100 text-amber-900",
  4: "bg-amber-200 text-amber-900",
  8: "bg-orange-300 text-orange-950",
  16: "bg-orange-400 text-white",
  32: "bg-rose-400 text-white",
  64: "bg-rose-500 text-white",
  128: "bg-yellow-400 text-yellow-950",
  256: "bg-yellow-500 text-yellow-950",
  512: "bg-lime-500 text-lime-950",
  1024: "bg-emerald-500 text-white",
  2048: "bg-primary text-primary-foreground",
};

function Game2048() {
  const [grid, setGrid] = useState<Grid>(() => addRandom(addRandom(empty())));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);

  useEffect(() => {
    const b = Number(localStorage.getItem("dap.2048.best") || "0");
    setBest(b);
  }, []);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      localStorage.setItem("dap.2048.best", String(score));
    }
  }, [score, best]);

  const doMove = useCallback((dir: "left" | "right" | "up" | "down") => {
    setGrid((g) => {
      const { grid: next, gained, moved } = move(g, dir);
      if (!moved) return g;
      setScore((s) => s + gained);
      return addRandom(next);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft") { e.preventDefault(); doMove("left"); }
      else if (k === "ArrowRight") { e.preventDefault(); doMove("right"); }
      else if (k === "ArrowUp") { e.preventDefault(); doMove("up"); }
      else if (k === "ArrowDown") { e.preventDefault(); doMove("down"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]);

  // Pointer drag / swipe (mouse + touch)
  useEffect(() => {
    const el = document.getElementById("g2048");
    if (!el) return;
    let sx = 0, sy = 0, dragging = false;
    const THRESHOLD = 25;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "right" : "left");
      else doMove(dy > 0 ? "down" : "up");
    };
    const onCancel = () => { dragging = false; };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, [doMove]);

  const reset = () => { setGrid(addRandom(addRandom(empty()))); setScore(0); };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">2048</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Score: <span className="font-semibold">{score}</span></div>
        <div>Best: <span className="font-semibold">{best}</span></div>
        <Button size="sm" variant="secondary" onClick={reset}>New game</Button>
      </div>
      <div id="g2048" className="mt-4 grid touch-none select-none grid-cols-4 gap-2 rounded-xl bg-card p-2">
        {grid.flat().map((v, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-lg text-xl font-bold transition-all ${TILE_COLORS[v] ?? "bg-primary text-primary-foreground"}`}
          >
            {v !== 0 ? v : ""}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Arrow keys or swipe. Merge tiles to reach 2048.
      </p>
    </div>
  );
}
