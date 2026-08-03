import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games/2048")({
  component: Game2048,
});

const SIZE = 4;

type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  isNew?: boolean;
  isMerged?: boolean;
};

type Board = (Tile | null)[][];

let TILE_ID = 1;

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));
}

function addRandom(board: Board): Board {
  const spots: [number, number][] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (!board[r][c]) spots.push([r, c]);
  if (!spots.length) return board;
  const [r, c] = spots[Math.floor(Math.random() * spots.length)];
  const nb = board.map((row) => row.slice());
  nb[r][c] = {
    id: TILE_ID++,
    value: Math.random() < 0.9 ? 2 : 4,
    row: r,
    col: c,
    isNew: true,
  };
  return nb;
}

/**
 * Slide one line (array of tiles or nulls, length SIZE) toward index 0.
 * Returns the new line plus gained score. Preserves tile ids so we can
 * animate movement; merged tiles keep the destination tile's id and mark
 * isMerged for a pop animation.
 */
function slideLine(line: (Tile | null)[]): { line: (Tile | null)[]; gained: number } {
  const compact = line.filter((t): t is Tile => t !== null);
  const out: (Tile | null)[] = [];
  let gained = 0;
  let i = 0;
  while (i < compact.length) {
    const a = compact[i];
    const b = compact[i + 1];
    if (b && a.value === b.value) {
      const merged: Tile = { ...a, value: a.value * 2, isMerged: true, isNew: false };
      gained += merged.value;
      out.push(merged);
      i += 2;
    } else {
      out.push({ ...a, isMerged: false, isNew: false });
      i += 1;
    }
  }
  while (out.length < SIZE) out.push(null);
  return { line: out, gained };
}

function transpose(b: Board): Board {
  const nb = emptyBoard();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) nb[c][r] = b[r][c];
  return nb;
}
function reverseRows(b: Board): Board {
  return b.map((row) => row.slice().reverse());
}

function move(
  board: Board,
  dir: "left" | "right" | "up" | "down",
): { board: Board; gained: number; moved: boolean } {
  let b = board.map((row) => row.slice());
  if (dir === "up") b = transpose(b);
  else if (dir === "down") b = reverseRows(transpose(b));
  else if (dir === "right") b = reverseRows(b);

  let gained = 0;
  const next = b.map((row) => {
    const { line, gained: g } = slideLine(row);
    gained += g;
    return line;
  });

  let out = next;
  if (dir === "up") out = transpose(out);
  else if (dir === "down") out = transpose(reverseRows(out));
  else if (dir === "right") out = reverseRows(out);

  // Update row/col coordinates on each tile so the animated position is correct.
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = out[r][c];
      if (t) {
        t.row = r;
        t.col = c;
      }
    }
  }

  const before = board.flat().map((t) => (t ? `${t.id}:${t.value}` : "_")).join(",");
  const after = out.flat().map((t) => (t ? `${t.id}:${t.value}` : "_")).join(",");
  return { board: out, gained, moved: before !== after };
}

function boardHasMoves(b: Board): boolean {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!b[r][c]) return true;
      const v = b[r][c]!.value;
      if (r + 1 < SIZE && b[r + 1][c]?.value === v) return true;
      if (c + 1 < SIZE && b[r][c + 1]?.value === v) return true;
    }
  return false;
}

const TILE_COLORS: Record<number, string> = {
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

function tileColor(v: number) {
  return TILE_COLORS[v] ?? "bg-primary text-primary-foreground";
}

function Game2048() {
  const [board, setBoard] = useState<Board>(() => addRandom(addRandom(emptyBoard())));
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
    setBoard((b) => {
      const { board: next, gained, moved } = move(b, dir);
      if (!moved) return b;
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

  const boardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = boardRef.current;
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

  const reset = () => {
    TILE_ID = 1;
    setBoard(addRandom(addRandom(emptyBoard())));
    setScore(0);
  };

  const tiles = useMemo(() => {
    const list: Tile[] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (board[r][c]) list.push(board[r][c]!);
    // Sort by id so React reuses DOM nodes and CSS transitions animate movement.
    return list.sort((a, b) => a.id - b.id);
  }, [board]);

  const gameOver = !boardHasMoves(board);

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <h1 className="text-2xl font-bold">2048</h1>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Score: <span className="font-semibold">{score}</span></div>
        <div>Best: <span className="font-semibold">{best}</span></div>
        <Button size="sm" variant="secondary" onClick={reset}>New game</Button>
      </div>

      <div
        ref={boardRef}
        // The board reads its own drags, and it is the only game surface
        // that is not a <canvas>, so it has to opt out of the sidebar
        // swipe by name.
        data-no-swipe
        className="relative mt-4 aspect-square touch-none cursor-grab select-none rounded-xl bg-card p-2 active:cursor-grabbing"
      >
        {/* Background cells */}
        <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-2">
          {Array.from({ length: SIZE * SIZE }).map((_, i) => (
            <div key={i} className="rounded-lg bg-muted/40" />
          ))}
        </div>

        {/* Animated tiles */}
        <div className="pointer-events-none absolute inset-0 p-2">
          {tiles.map((t) => {
            const pct = 100 / SIZE;
            const left = `calc(${t.col * pct}% + ${t.col * 0.5}rem)`;
            const top = `calc(${t.row * pct}% + ${t.row * 0.5}rem)`;
            const size = `calc(${pct}% - ${(SIZE - 1) * 0.5 / SIZE}rem)`;
            return (
              <div
                key={t.id}
                className="absolute transition-[left,top] duration-150 ease-[cubic-bezier(0.2,0.9,0.3,1)]"
                style={{ left, top, width: size, height: size }}
              >
                <div
                  className={`flex h-full w-full items-center justify-center rounded-lg text-xl font-bold shadow-sm ${tileColor(t.value)} ${
                    t.isNew ? "animate-tile-drop" : t.isMerged ? "animate-tile-pop" : ""
                  }`}
                >
                  {t.value}
                </div>
              </div>
            );
          })}
        </div>

        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm animate-game-over-in">
            <div className="text-center">
              <div className="text-2xl font-bold">Game over</div>
              <Button className="mt-3" onClick={reset}>Play again</Button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Arrow keys, click-and-drag, or swipe. Merge tiles to reach 2048.
      </p>
    </div>
  );
}
