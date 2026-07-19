// DAP Track shared engine constants: themes, tile sizes, top-down
// thumbnail renderer, and time formatting. No three.js here — this
// module is imported by the server for validation-adjacent uses and
// must stay browser-safe & DOM-free (canvas only used from client
// components).
import type { TrackData, Tile } from "./track-validation";
import { isTrackData } from "./track-validation";

export type Season = "spring" | "summer" | "fall" | "winter";

export type Theme = {
  ground: string;
  road: string;
  roadEdge: string;
  dash: string;
  label: string;
  emoji: string;
  fleck: string;
  sky: string;
};

export const THEMES: Record<Season, Theme> = {
  spring: { ground: "#4ea862", road: "#3a3a44", roadEdge: "#e5e7eb", dash: "#fde047", label: "Spring", emoji: "🌱", fleck: "#7ed07a", sky: "#8ec9ff" },
  summer: { ground: "#d9b26a", road: "#a88558", roadEdge: "#f4e2b8", dash: "#ffffff", label: "Summer", emoji: "🏜️", fleck: "#f5deb3", sky: "#ffd47a" },
  fall:   { ground: "#8a5a2b", road: "#3a3a44", roadEdge: "#e5e7eb", dash: "#fde047", label: "Fall",   emoji: "🍂", fleck: "#f97316", sky: "#f4b183" },
  winter: { ground: "#e8eef5", road: "#c9d3de", roadEdge: "#94a3b8", dash: "#64748b", label: "Winter", emoji: "❄️", fleck: "#ffffff", sky: "#cfe8f5" },
};

export const TILE = 10;          // world units per tile
export const ROAD_HALF = 3.2;    // road half-width in world units
export const RAMP_H = 2.2;       // world-height per elevation step

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}`}.${String(cs).padStart(2, "0")}`;
}

// Rotate a unit tile-local (dx, dz) in [-0.5..0.5] by rot*90° CW.
export function rotateXZ(dx: number, dz: number, rot: number): [number, number] {
  const r = ((rot % 4) + 4) % 4;
  switch (r) {
    case 0: return [dx, dz];
    case 1: return [dz, -dx];
    case 2: return [-dx, -dz];
    default: return [-dz, dx];
  }
}

// Small top-down 2D thumbnail of a tile track. Not the 3D renderer.
export function drawTrackThumbnail(
  ctx: CanvasRenderingContext2D,
  data: TrackData | null,
  season: Season,
  width: number,
  height: number,
): void {
  const theme = THEMES[season];
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, width, height);
  if (!data || !isTrackData(data) || data.tiles.length === 0) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.font = "12px sans-serif";
    ctx.fillText("legacy track", 8, 18);
    return;
  }

  // Compute bounds.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const t of data.tiles) {
    if (t.x < minX) minX = t.x; if (t.x > maxX) maxX = t.x;
    if (t.z < minZ) minZ = t.z; if (t.z > maxZ) maxZ = t.z;
  }
  const pad = 1;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const gw = maxX - minX + 1, gh = maxZ - minZ + 1;
  const scale = Math.min(width / gw, height / gh);
  const ox = (width - gw * scale) / 2 - minX * scale;
  const oy = (height - gh * scale) / 2 - minZ * scale;

  const px = (x: number) => ox + x * scale;
  const py = (z: number) => oy + z * scale;

  for (const t of data.tiles) drawTileTop(ctx, t, theme, px, py, scale);
}

function drawTileTop(
  ctx: CanvasRenderingContext2D,
  t: Tile,
  theme: Theme,
  px: (x: number) => number,
  py: (z: number) => number,
  s: number,
) {
  const cx = px(t.x) + s / 2;
  const cy = py(t.z) + s / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((t.rot * Math.PI) / 2);
  const w = s;
  const roadW = s * 0.62;
  ctx.fillStyle = theme.road;

  if (t.type === "curveL" || t.type === "curveR") {
    // Draw arc from bottom-mid to left-mid (curveL) or right-mid (curveR).
    const sign = t.type === "curveL" ? -1 : 1;
    ctx.beginPath();
    // outer edge
    ctx.arc(sign * w / 2, w / 2, w / 2 + roadW / 2, sign > 0 ? Math.PI : 0, sign > 0 ? 1.5 * Math.PI : -0.5 * Math.PI, sign < 0);
    ctx.arc(sign * w / 2, w / 2, Math.max(0, w / 2 - roadW / 2), sign > 0 ? 1.5 * Math.PI : -0.5 * Math.PI, sign > 0 ? Math.PI : 0, sign > 0);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(-roadW / 2, -w / 2, roadW, w);
    if (t.type === "start" || t.type === "finish") {
      ctx.fillStyle = t.type === "start" ? "#22c55e" : "#ef4444";
      ctx.fillRect(-roadW / 2, -w / 2, roadW, Math.max(2, s * 0.12));
    } else if (t.type === "checkpoint") {
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(-roadW / 2, -1.5, roadW, 3);
    } else if (t.type === "rampUp" || t.type === "rampDown") {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(-roadW / 2, w / 2);
      ctx.lineTo(roadW / 2, w / 2);
      ctx.lineTo(0, -w / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
