/**
 * The DAP Track editor viewport.
 *
 * A single 2D canvas draws the whole 49x49 grid, which keeps panning and
 * zooming smooth no matter how many pieces a track has. All interaction is
 * pointer-based:
 *
 *   paint tool   — click/drag to lay road, right-drag erases
 *   select tool  — click a piece, shift-click to add, drag to marquee,
 *                  drag a selected piece to move the whole selection
 *   pan          — middle mouse, space-drag, or the pan tool
 *   wheel        — zoom around the cursor
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { GRID_MAX, GRID_MIN, type Rot, type Tile, type TileType, type TrackData } from "@/lib/track-validation";
import { keyOf, normalizeRect, tilesInRect, trackBounds, type Rect } from "@/lib/track-editor-model";

export const TILE_COLOR: Record<TileType, string> = {
  start: "#22c55e",
  finish: "#ef4444",
  checkpoint: "#3b82f6",
  boost: "#06b6d4",
  rampUp: "#a855f7",
  rampDown: "#7c3aed",
  jump: "#c026d3",
  curveL: "#64748b",
  curveR: "#64748b",
  straight: "#94a3b8",
};

export const TILE_GLYPH: Record<TileType, string> = {
  straight: "▮", curveL: "↰", curveR: "↱", rampUp: "↗", rampDown: "↘",
  jump: "⤴", boost: "»", checkpoint: "◆", start: "S", finish: "F",
};

export type EditorTool = "paint" | "select" | "erase" | "pan";

interface Camera { panX: number; panZ: number; scale: number }

const MIN_SCALE = 12;
const MAX_SCALE = 64;

export interface EditorCanvasProps {
  data: TrackData;
  level: number;
  selection: string[];
  tool: EditorTool;
  activeType: TileType;
  rot: Rot;
  showGhosts: boolean;
  onPaint: (x: number, z: number) => void;
  onErase: (x: number, z: number) => void;
  onSelect: (keys: string[], additive: boolean) => void;
  onMoveSelection: (dx: number, dz: number) => void;
  onCursor?: (cell: { x: number; z: number } | null) => void;
}

export function EditorCanvas(props: EditorCanvasProps) {
  const {
    data, level, selection, tool, activeType, rot, showGhosts,
    onPaint, onErase, onSelect, onMoveSelection, onCursor,
  } = props;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cam, setCam] = useState<Camera>({ panX: 0, panZ: 0, scale: 30 });
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [dragDelta, setDragDelta] = useState<{ dx: number; dz: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Mutable pointer bookkeeping — refs so a drag never re-renders per pixel.
  const gesture = useRef<
    | { kind: "paint" | "erase"; last: string }
    | { kind: "pan"; sx: number; sy: number; panX: number; panZ: number }
    | { kind: "marquee"; start: { x: number; z: number }; additive: boolean }
    | { kind: "move"; start: { x: number; z: number } }
    | null
  >(null);

  const framed = useRef(false);
  const size = useRef({ w: 800, h: 520 });

  /* ── camera helpers ─────────────────────────────────────────────── */
  const toCell = useCallback(
    (clientX: number, clientY: number) => {
      const node = canvasRef.current;
      if (!node) return { x: 0, z: 0 };
      const r = node.getBoundingClientRect();
      return {
        x: Math.floor((clientX - r.left - cam.panX) / cam.scale),
        z: Math.floor((clientY - r.top - cam.panZ) / cam.scale),
      };
    },
    [cam]
  );

  const frame = useCallback(() => {
    const { w, h } = size.current;
    const b = trackBounds(data) ?? { x0: -4, x1: 4, z0: -4, z1: 4 };
    const cells = Math.max(b.x1 - b.x0 + 6, b.z1 - b.z0 + 6, 8);
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.floor(Math.min(w, h) / cells)));
    const cx = (b.x0 + b.x1 + 1) / 2;
    const cz = (b.z0 + b.z1 + 1) / 2;
    setCam({ scale, panX: w / 2 - cx * scale, panZ: h / 2 - cz * scale });
  }, [data]);

  // Frame the track once, when it first has content (open/create).
  useEffect(() => {
    if (framed.current) return;
    if (data.tiles.length === 0) return;
    framed.current = true;
    frame();
  }, [data.tiles.length, frame]);

  /* ── sizing ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      size.current = { w: Math.max(320, r.width), h: Math.max(320, r.height) };
      draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── drawing ────────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    const node = canvasRef.current;
    if (!node) return;
    const { w, h } = size.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (node.width !== Math.round(w * dpr) || node.height !== Math.round(h * dpr)) {
      node.width = Math.round(w * dpr);
      node.height = Math.round(h * dpr);
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;
    }
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { panX, panZ, scale } = cam;
    const sx = (x: number) => x * scale + panX;
    const sz = (z: number) => z * scale + panZ;

    // Playable area
    ctx.fillStyle = "rgba(148,163,184,0.06)";
    ctx.fillRect(sx(GRID_MIN), sz(GRID_MIN), (GRID_MAX - GRID_MIN + 1) * scale, (GRID_MAX - GRID_MIN + 1) * scale);

    // Grid — thin lines, brighter every 4 cells
    const firstX = Math.max(GRID_MIN, Math.floor(-panX / scale) - 1);
    const lastX = Math.min(GRID_MAX + 1, Math.ceil((w - panX) / scale) + 1);
    const firstZ = Math.max(GRID_MIN, Math.floor(-panZ / scale) - 1);
    const lastZ = Math.min(GRID_MAX + 1, Math.ceil((h - panZ) / scale) + 1);
    ctx.lineWidth = 1;
    for (let x = firstX; x <= lastX; x++) {
      ctx.strokeStyle = x % 4 === 0 ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.12)";
      ctx.beginPath();
      ctx.moveTo(Math.round(sx(x)) + 0.5, sz(firstZ));
      ctx.lineTo(Math.round(sx(x)) + 0.5, sz(lastZ));
      ctx.stroke();
    }
    for (let z = firstZ; z <= lastZ; z++) {
      ctx.strokeStyle = z % 4 === 0 ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.12)";
      ctx.beginPath();
      ctx.moveTo(sx(firstX), Math.round(sz(z)) + 0.5);
      ctx.lineTo(sx(lastX), Math.round(sz(z)) + 0.5);
      ctx.stroke();
    }

    // Origin cross
    ctx.strokeStyle = "rgba(56,189,248,0.35)";
    ctx.beginPath();
    ctx.moveTo(sx(0), sz(GRID_MIN)); ctx.lineTo(sx(0), sz(GRID_MAX + 1));
    ctx.moveTo(sx(GRID_MIN), sz(0)); ctx.lineTo(sx(GRID_MAX + 1), sz(0));
    ctx.stroke();

    const selected = new Set(selection);
    const drawTile = (t: Tile, opacity: number, moved = false) => {
      const dx = moved && dragDelta ? dragDelta.dx : 0;
      const dz = moved && dragDelta ? dragDelta.dz : 0;
      const px = sx(t.x + dx);
      const pz = sz(t.z + dz);
      const pad = Math.max(1, scale * 0.06);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = TILE_COLOR[t.type];
      ctx.fillRect(px + pad, pz + pad, scale - pad * 2, scale - pad * 2);
      // Glyph, rotated with the piece so facing is readable at a glance.
      ctx.translate(px + scale / 2, pz + scale / 2);
      ctx.rotate((t.rot * Math.PI) / 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `bold ${Math.max(9, Math.floor(scale * 0.5))}px ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(TILE_GLYPH[t.type], 0, 0);
      ctx.restore();
      if (t.y > 0 && opacity > 0.5) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        const s = Math.max(8, Math.floor(scale * 0.3));
        ctx.fillRect(px + scale - s - 1, pz + 1, s, s);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(7, s - 3)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(t.y), px + scale - s / 2 - 1, pz + s / 2 + 1);
        ctx.restore();
      }
    };

    if (showGhosts) for (const t of data.tiles) if (t.y !== level) drawTile(t, 0.18);
    for (const t of data.tiles) {
      if (t.y !== level) continue;
      drawTile(t, 1, selected.has(keyOf(t)));
    }

    // Selection outlines
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    for (const t of data.tiles) {
      if (!selected.has(keyOf(t))) continue;
      const dx = dragDelta?.dx ?? 0;
      const dz = dragDelta?.dz ?? 0;
      ctx.strokeRect(sx(t.x + dx) + 1, sz(t.z + dz) + 1, scale - 2, scale - 2);
    }

    // Hover ghost of the piece about to be placed
    if (hover && tool === "paint") {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = TILE_COLOR[activeType];
      ctx.fillRect(sx(hover.x) + 2, sz(hover.z) + 2, scale - 4, scale - 4);
      ctx.translate(sx(hover.x) + scale / 2, sz(hover.z) + scale / 2);
      ctx.rotate((rot * Math.PI) / 2);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(9, Math.floor(scale * 0.5))}px ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(TILE_GLYPH[activeType], 0, 0);
      ctx.restore();
    } else if (hover) {
      ctx.strokeStyle = "rgba(56,189,248,0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx(hover.x) + 1, sz(hover.z) + 1, scale - 2, scale - 2);
    }

    if (marquee) {
      const r = normalizeRect(marquee);
      ctx.fillStyle = "rgba(56,189,248,0.15)";
      ctx.strokeStyle = "rgba(56,189,248,0.8)";
      ctx.lineWidth = 1.5;
      const x = sx(r.x0), z = sz(r.z0);
      const wdt = (r.x1 - r.x0 + 1) * scale, hgt = (r.z1 - r.z0 + 1) * scale;
      ctx.fillRect(x, z, wdt, hgt);
      ctx.strokeRect(x + 0.5, z + 0.5, wdt - 1, hgt - 1);
    }
  }, [cam, data, level, selection, hover, marquee, dragDelta, tool, activeType, rot, showGhosts]);

  useEffect(() => { draw(); }, [draw]);

  /* ── space = temporary pan ──────────────────────────────────────── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  /* ── pointer handling ───────────────────────────────────────────── */
  const onPointerDown = (e: React.PointerEvent) => {
    const node = canvasRef.current;
    if (!node) return;
    node.setPointerCapture(e.pointerId);
    const cell = toCell(e.clientX, e.clientY);
    const panning = tool === "pan" || spaceHeld || e.button === 1;

    if (panning) {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, panX: cam.panX, panZ: cam.panZ };
      return;
    }
    if (e.button === 2 || tool === "erase") {
      gesture.current = { kind: "erase", last: `${cell.x},${cell.z}` };
      onErase(cell.x, cell.z);
      return;
    }
    if (tool === "paint") {
      gesture.current = { kind: "paint", last: `${cell.x},${cell.z}` };
      onPaint(cell.x, cell.z);
      return;
    }
    // select tool
    const hit = data.tiles.find((t) => t.y === level && t.x === cell.x && t.z === cell.z);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (hit && (selection.includes(keyOf(hit)) || !additive)) {
      if (!selection.includes(keyOf(hit))) onSelect([keyOf(hit)], false);
      gesture.current = { kind: "move", start: cell };
      setDragDelta({ dx: 0, dz: 0 });
      return;
    }
    if (hit && additive) {
      onSelect([keyOf(hit)], true);
      return;
    }
    gesture.current = { kind: "marquee", start: cell, additive };
    setMarquee({ x0: cell.x, z0: cell.z, x1: cell.x, z1: cell.z });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const cell = toCell(e.clientX, e.clientY);
    setHover(cell);
    onCursor?.(cell);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      setCam((c) => ({ ...c, panX: g.panX + (e.clientX - g.sx), panZ: g.panZ + (e.clientY - g.sy) }));
      return;
    }
    if (g.kind === "paint" || g.kind === "erase") {
      const k = `${cell.x},${cell.z}`;
      if (k === g.last) return;
      g.last = k;
      if (g.kind === "paint") onPaint(cell.x, cell.z);
      else onErase(cell.x, cell.z);
      return;
    }
    if (g.kind === "marquee") {
      setMarquee({ x0: g.start.x, z0: g.start.z, x1: cell.x, z1: cell.z });
      return;
    }
    if (g.kind === "move") {
      setDragDelta({ dx: cell.x - g.start.x, dz: cell.z - g.start.z });
    }
  };

  const endGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "marquee" && marquee) {
      const keys = tilesInRect(data, marquee, level).map(keyOf);
      onSelect(keys, g.additive);
      setMarquee(null);
      return;
    }
    if (g.kind === "move" && dragDelta) {
      if (dragDelta.dx !== 0 || dragDelta.dz !== 0) onMoveSelection(dragDelta.dx, dragDelta.dz);
      setDragDelta(null);
    }
  };

  // React's onWheel is passive, so zoom is bound natively to keep the page
  // from scrolling under the editor.
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = node.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setCam((c) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * (e.deltaY < 0 ? 1.12 : 0.89)));
        if (next === c.scale) return c;
        const k = next / c.scale;
        return { scale: next, panX: mx - (mx - c.panX) * k, panZ: my - (my - c.panZ) * k };
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);


  const cursor =
    tool === "pan" || spaceHeld ? "grab" : tool === "erase" ? "crosshair" : tool === "paint" ? "cell" : "default";

  return (
    <div
      ref={wrapRef}
      className="relative h-[clamp(340px,58vh,640px)] w-full overflow-hidden rounded-xl border border-border bg-muted/10"
    >
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerLeave={() => { setHover(null); onCursor?.(null); }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
        {hover ? `x ${hover.x} · z ${hover.z}` : "—"} · level {level} · {Math.round(cam.scale)}px
      </div>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setCam((c) => ({ ...c, scale: Math.min(MAX_SCALE, c.scale * 1.2) }))}
          className="h-7 w-7 rounded-md border border-border bg-background/80 text-sm backdrop-blur hover:border-primary"
          title="Zoom in"
        >+</button>
        <button
          type="button"
          onClick={() => setCam((c) => ({ ...c, scale: Math.max(MIN_SCALE, c.scale / 1.2) }))}
          className="h-7 w-7 rounded-md border border-border bg-background/80 text-sm backdrop-blur hover:border-primary"
          title="Zoom out"
        >−</button>
        <button
          type="button"
          onClick={frame}
          className="h-7 w-7 rounded-md border border-border bg-background/80 text-xs backdrop-blur hover:border-primary"
          title="Fit track to view"
        >⤢</button>
      </div>
    </div>
  );
}
