// Poly Racer shared engine: themes, tile geometry constants, the surface
// sampler that both the physics and the camera use, and the top-down
// thumbnail renderer.
//
// No three.js here — this module is imported by the server for
// validation-adjacent uses and must stay browser-safe & DOM-free (canvas
// is only touched from client components).
import type { TrackData, Tile, Rot, TileType } from "./track-validation";
import { columnKey, isRamp, rotIsForward, toTrackData } from "./track-validation";

export type Season = "spring" | "summer" | "fall" | "winter";

export const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

export type Theme = {
  ground: string;
  road: string;
  roadEdge: string;
  dash: string;
  label: string;
  emoji: string;
  fleck: string;
  sky: string;
  /** Pillars and the underside of raised road. */
  support: string;
  /** Scatter props dotted around the terrain. */
  prop: string;
};

export const THEMES: Record<Season, Theme> = {
  spring: { ground: "#4ea862", road: "#3a3a44", roadEdge: "#e5e7eb", dash: "#fde047", label: "Spring", emoji: "🌱", fleck: "#7ed07a", sky: "#8ec9ff", support: "#2f2f38", prop: "#2f8f4e" },
  summer: { ground: "#d9b26a", road: "#a88558", roadEdge: "#f4e2b8", dash: "#ffffff", label: "Summer", emoji: "🏜️", fleck: "#f5deb3", sky: "#ffd47a", support: "#8a6a44", prop: "#c08a4a" },
  fall:   { ground: "#8a5a2b", road: "#3a3a44", roadEdge: "#e5e7eb", dash: "#fde047", label: "Fall",   emoji: "🍂", fleck: "#f97316", sky: "#f4b183", support: "#2f2f38", prop: "#c2410c" },
  winter: { ground: "#e8eef5", road: "#c9d3de", roadEdge: "#94a3b8", dash: "#64748b", label: "Winter", emoji: "❄️", fleck: "#ffffff", sky: "#cfe8f5", support: "#94a3b8", prop: "#7f9bb3" },
};

export const TILE = 10;          // world units per tile
export const ROAD_HALF = 3.2;    // road half-width in world units
export const LEVEL_H = 5;        // world height of one grid level
export const JUMP_H = 1.9;       // kicker lip height on a jump tile
export const ROAD_THICK = 0.5;   // visual slab thickness
export const TERRAIN_Y = -0.4;   // terrain plane — off the road, but drivable

/** Curve centreline radius. */
export const CURVE_R = TILE / 2;

/** World height of a grid level. */
export const levelY = (level: number) => level * LEVEL_H;

/**
 * Which way a bend hugs, in tile-local X. The world is right-handed with
 * Y up, so a car facing +Z has its right hand at -X — a right-hander
 * curls around a centre at local -X.
 */
export function curveSign(type: TileType): 1 | -1 {
  return type === "curveR" ? -1 : 1;
}

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}`}.${String(cs).padStart(2, "0")}`;
}

/** Signed delta, e.g. "-1.24" / "+0.31". */
export function formatDelta(ms: number): string {
  return `${ms < 0 ? "-" : "+"}${formatMs(Math.abs(ms))}`;
}

// Rotate a tile-local (dx, dz) by rot × 90° about Y — matching three.js'
// Object3D.rotation.y so meshes and maths agree.
export function rotateXZ(dx: number, dz: number, rot: number): [number, number] {
  const r = ((rot % 4) + 4) % 4;
  switch (r) {
    case 0: return [dx, dz];
    case 1: return [dz, -dx];
    case 2: return [-dx, -dz];
    default: return [-dz, dx];
  }
}

/** Inverse of rotateXZ — world offset to tile-local. */
export function unrotateXZ(dx: number, dz: number, rot: number): [number, number] {
  return rotateXZ(dx, dz, (4 - (((rot % 4) + 4) % 4)) % 4);
}

// ── Medals ──────────────────────────────────────────────────────────

export type Medal = "author" | "gold" | "silver" | "bronze" | null;

export const MEDAL_MULT = { author: 1, gold: 1.2, silver: 1.5, bronze: 2 } as const;

export function medalFor(timeMs: number, goalMs: number): Medal {
  if (timeMs <= goalMs * MEDAL_MULT.author) return "author";
  if (timeMs <= goalMs * MEDAL_MULT.gold) return "gold";
  if (timeMs <= goalMs * MEDAL_MULT.silver) return "silver";
  if (timeMs <= goalMs * MEDAL_MULT.bronze) return "bronze";
  return null;
}

export const MEDAL_META: Record<Exclude<Medal, null>, { label: string; emoji: string; color: string }> = {
  author: { label: "Author", emoji: "🏆", color: "#a78bfa" },
  gold:   { label: "Gold",   emoji: "🥇", color: "#fbbf24" },
  silver: { label: "Silver", emoji: "🥈", color: "#cbd5e1" },
  bronze: { label: "Bronze", emoji: "🥉", color: "#d97706" },
};

// ── Surface sampling ────────────────────────────────────────────────

export type Surface = {
  /** Whether the sample point sits on tarmac. */
  onRoad: boolean;
  /** Road surface height at the sample point. */
  y: number;
  /** Surface gradient, world space (dy/dx, dy/dz). */
  gx: number;
  gz: number;
  /** Unit vector along the road centreline, pointing "forward" for the tile. */
  dirX: number;
  dirZ: number;
  /** Signed distance from the centreline; |lateral| ≤ ROAD_HALF on road. */
  lateral: number;
  /** The deck the sample landed on, if any. */
  tile: Tile | null;
};

const OFF: Surface = { onRoad: false, y: TERRAIN_Y, gx: 0, gz: 0, dirX: 0, dirZ: 1, lateral: Infinity, tile: null };

/** Smooth 0→1 ramp used for the jump kicker. */
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Height profile along a tile's local Z axis, plus the local dy/dlz
 * slope. `u` runs 0 (entry edge) → 1 (exit edge).
 */
function profile(type: TileType, level: number, u: number): { y: number; slope: number } {
  const base = levelY(level);
  switch (type) {
    case "rampUp":
      return { y: base + u * LEVEL_H, slope: LEVEL_H / TILE };
    case "rampDown":
      return { y: base - u * LEVEL_H, slope: -LEVEL_H / TILE };
    case "jump": {
      const k = smoothstep((u - 0.45) / 0.55);
      const t = Math.max(0, Math.min(1, (u - 0.45) / 0.55));
      const dk = (6 * t * (1 - t)) / 0.55;
      return { y: base + k * JUMP_H, slope: (dk * JUMP_H) / TILE };
    }
    default:
      return { y: base, slope: 0 };
  }
}

/**
 * Surface height along a piece's local Z axis — `u` runs 0 at the entry
 * edge to 1 at the exit. Unlike a sampler probe this is unambiguous
 * about which deck it means, so mesh building uses it directly.
 */
export function tileHeightAt(t: Tile, u: number): number {
  return profile(t.type, t.y, u).y;
}

export type Sampler = {
  /**
   * World-space surface probe. `fromY` is the height of the thing doing
   * the probing: with stacked decks it picks the highest road at or just
   * below that height, so a car on a bridge stays on the bridge and a
   * car underneath drives on the ground.
   */
  at: (wx: number, wz: number, fromY: number) => Surface;
  /** Lowest road underside strictly above `aboveY`, or Infinity. */
  ceilingAt: (wx: number, wz: number, aboveY: number) => number;
  worldX: (gx: number) => number;
  worldZ: (gz: number) => number;
  gridX: (wx: number) => number;
  gridZ: (wz: number) => number;
  /** Every deck stacked in one grid column. */
  columnAt: (wx: number, wz: number) => Tile[];
  /** Centre of a tile in world space, on the road surface. */
  tileCenter: (t: Tile) => { x: number; y: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxLevel: number };
};

/** How far above a deck the car can be and still be standing on it. */
const STAND_TOL = 1.4;

/**
 * Build a sampler for a track. The track is re-centred on the origin so
 * the camera and fog behave regardless of where it was drawn on the grid.
 */
export function makeSampler(track: TrackData): Sampler {
  const columns = new Map<string, Tile[]>();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxLevel = 0;
  for (const t of track.tiles) {
    const key = columnKey(t.x, t.z);
    const col = columns.get(key);
    if (col) col.push(t); else columns.set(key, [t]);
    if (t.x < minX) minX = t.x;
    if (t.x > maxX) maxX = t.x;
    if (t.z < minZ) minZ = t.z;
    if (t.z > maxZ) maxZ = t.z;
    if (t.y > maxLevel) maxLevel = t.y;
  }
  if (!Number.isFinite(minX)) { minX = maxX = minZ = maxZ = 0; }
  // Highest deck first so the "topmost deck you can stand on" search can
  // stop at its first hit.
  for (const col of columns.values()) col.sort((a, b) => b.y - a.y);

  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const worldX = (gx: number) => (gx - cx) * TILE;
  const worldZ = (gz: number) => (gz - cz) * TILE;
  const gridX = (wx: number) => wx / TILE + cx;
  const gridZ = (wz: number) => wz / TILE + cz;

  const columnAt = (wx: number, wz: number): Tile[] =>
    columns.get(columnKey(Math.round(gridX(wx)), Math.round(gridZ(wz)))) ?? [];

  /** Surface of one specific deck at a world point. */
  const sampleTile = (t: Tile, wx: number, wz: number): Surface => {
    const [lx, lz] = unrotateXZ(wx - worldX(t.x), wz - worldZ(t.z), t.rot);

    if (t.type === "curveL" || t.type === "curveR") {
      const sign = curveSign(t.type);
      const ccx = sign * (TILE / 2), ccz = -TILE / 2;
      const rx = lx - ccx, rz = lz - ccz;
      const d = Math.hypot(rx, rz) || 1e-6;
      const lateral = (d - CURVE_R) * sign;
      const tanX = (-rz / d) * -sign;
      const tanZ = (rx / d) * -sign;
      const [dirX, dirZ] = rotateXZ(tanX, tanZ, t.rot);
      return {
        onRoad: Math.abs(lateral) <= ROAD_HALF,
        y: levelY(t.y),
        gx: 0, gz: 0,
        dirX, dirZ,
        lateral,
        tile: t,
      };
    }

    const u = (lz + TILE / 2) / TILE;
    const { y, slope } = profile(t.type, t.y, u);
    const [gx, gz] = rotateXZ(0, slope, t.rot);
    const [dirX, dirZ] = rotateXZ(0, 1, t.rot);
    return {
      onRoad: Math.abs(lx) <= ROAD_HALF,
      y,
      gx, gz,
      dirX, dirZ,
      lateral: -lx,   // local +X is the driver's left
      tile: t,
    };
  };

  const at = (wx: number, wz: number, fromY: number): Surface => {
    const col = columnAt(wx, wz);
    if (col.length === 0) return OFF;
    let best: Surface | null = null;
    let fallback: Surface | null = null;
    for (const t of col) {           // highest deck first
      const s = sampleTile(t, wx, wz);
      if (!s.onRoad) continue;
      if (s.y <= fromY + STAND_TOL) { best = s; break; }
      fallback = s;                  // deck overhead — remember the lowest
    }
    // Nothing at or below us: we're under a bridge, so there's no road
    // here, but keep the overhead deck's identity out of it.
    if (!best) return fallback && fallback.y <= fromY + STAND_TOL ? fallback : OFF;
    return best;
  };

  const ceilingAt = (wx: number, wz: number, aboveY: number): number => {
    let lowest = Infinity;
    for (const t of columnAt(wx, wz)) {
      const s = sampleTile(t, wx, wz);
      if (!s.onRoad) continue;
      const under = s.y - ROAD_THICK;
      if (under > aboveY && under < lowest) lowest = under;
    }
    return lowest;
  };

  const tileCenter = (t: Tile) => {
    if (t.type === "curveL" || t.type === "curveR") {
      // Middle of the arc, not the middle of the square.
      const sign = curveSign(t.type);
      const a = Math.PI / 4;
      const lx = sign * (TILE / 2) - sign * Math.cos(a) * CURVE_R;
      const lz = -TILE / 2 + Math.sin(a) * CURVE_R;
      const [ox, oz] = rotateXZ(lx, lz, t.rot);
      return { x: worldX(t.x) + ox, y: levelY(t.y), z: worldZ(t.z) + oz };
    }
    const { y } = profile(t.type, t.y, 0.5);
    return { x: worldX(t.x), y, z: worldZ(t.z) };
  };

  return {
    at, ceilingAt, worldX, worldZ, gridX, gridZ, columnAt, tileCenter,
    bounds: { minX, maxX, minZ, maxZ, maxLevel },
  };
}

/** World-space heading (yaw) a car should have when it enters `t`. */
export function tileYaw(t: Tile, enterDir: Rot): number {
  return (rotIsForward(t, enterDir) ? t.rot : ((t.rot + 2) % 4)) * (Math.PI / 2);
}

// ── Local records ───────────────────────────────────────────────────

export type GhostSample = { t: number; x: number; y: number; z: number; ry: number };

const pbKey = (trackRef: string) => `dap.polytrack.pb.${trackRef}`;
const ghostKey = (trackRef: string) => `dap.polytrack.ghost.${trackRef}`;

export function readPersonalBest(trackRef: string): number | null {
  try {
    const raw = localStorage.getItem(pbKey(trackRef));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

/** Save a run locally. Returns the personal best after this run. */
export function recordPersonalBest(trackRef: string, timeMs: number): number {
  const prev = readPersonalBest(trackRef);
  const best = prev == null ? timeMs : Math.min(prev, timeMs);
  try { localStorage.setItem(pbKey(trackRef), String(Math.round(best))); } catch { /* ignore */ }
  return best;
}

export function readGhost(trackRef: string): GhostSample[] | null {
  try {
    const raw = localStorage.getItem(ghostKey(trackRef));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GhostSample[];
    return Array.isArray(parsed) && parsed.length > 1 ? parsed : null;
  } catch { return null; }
}

export function writeGhost(trackRef: string, samples: GhostSample[]): void {
  try { localStorage.setItem(ghostKey(trackRef), JSON.stringify(samples)); } catch { /* ignore */ }
}

// ── Thumbnail ───────────────────────────────────────────────────────

/** Small top-down 2D thumbnail of a tile track. Not the 3D renderer. */
export function drawTrackThumbnail(
  ctx: CanvasRenderingContext2D,
  input: TrackData | null,
  season: Season,
  width: number,
  height: number,
): void {
  const theme = THEMES[season];
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, width, height);
  const data = toTrackData(input);
  if (!data || data.tiles.length === 0) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.font = "12px sans-serif";
    ctx.fillText("legacy track", 8, 18);
    return;
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const t of data.tiles) {
    if (t.x < minX) minX = t.x;
    if (t.x > maxX) maxX = t.x;
    if (t.z < minZ) minZ = t.z;
    if (t.z > maxZ) maxZ = t.z;
  }
  const pad = 1;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const gw = maxX - minX + 1, gh = maxZ - minZ + 1;
  const scale = Math.min(width / gw, height / gh);
  const ox = (width - gw * scale) / 2 - minX * scale;
  const oy = (height - gh * scale) / 2 - minZ * scale;

  const px = (x: number) => ox + x * scale;
  const py = (z: number) => oy + z * scale;

  // Paint low decks first so overpasses sit on top of what they cross.
  const sorted = [...data.tiles].sort((a, b) => a.y - b.y);
  for (const t of sorted) drawTileTop(ctx, t, theme, px, py, scale);
}

/** Lighten a hex colour toward white — raised decks read brighter. */
function lift(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
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
  const roadW = s * (ROAD_HALF * 2) / TILE;

  ctx.save();
  ctx.translate(cx, cy);
  // Canvas Y grows downward, so a +rot Y-rotation is a -rot canvas turn.
  ctx.rotate((-t.rot * Math.PI) / 2);

  if (t.y > 0) {
    // Drop shadow so height reads at a glance.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.translate(s * 0.06 * t.y, s * 0.06 * t.y);
    paintRoad(ctx, t, roadW, s);
    ctx.restore();
  }

  ctx.fillStyle = t.y > 0 ? lift(theme.road, Math.min(0.45, t.y * 0.13)) : theme.road;
  paintRoad(ctx, t, roadW, s);

  if (t.type === "start" || t.type === "finish") {
    ctx.fillStyle = t.type === "start" ? "#22c55e" : "#ef4444";
    ctx.fillRect(-roadW / 2, -s * 0.1, roadW, Math.max(2, s * 0.2));
  } else if (t.type === "checkpoint") {
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(-roadW / 2, -Math.max(1.5, s * 0.08), roadW, Math.max(3, s * 0.16));
  } else if (t.type === "boost") {
    ctx.fillStyle = "#06b6d4";
    ctx.fillRect(-roadW / 2, -s / 2, roadW, s);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const off of [-0.22, 0.1]) {
      ctx.beginPath();
      ctx.moveTo(-roadW / 4, s * off + s * 0.16);
      ctx.lineTo(roadW / 4, s * off + s * 0.16);
      ctx.lineTo(0, s * off - s * 0.02);
      ctx.closePath();
      ctx.fill();
    }
  } else if (isRamp(t.type) || t.type === "jump") {
    ctx.fillStyle = t.type === "rampDown" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(-roadW / 2, -s / 2);
    ctx.lineTo(roadW / 2, -s / 2);
    ctx.lineTo(0, s / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Paints the road surface of a tile in its local frame. */
function paintRoad(ctx: CanvasRenderingContext2D, t: Tile, roadW: number, s: number) {
  if (t.type !== "curveL" && t.type !== "curveR") {
    ctx.fillRect(-roadW / 2, -s / 2, roadW, s);
    return;
  }
  // Quarter annulus centred on the corner the bend hugs. In local space
  // the entry edge is at -Z (canvas -Y) and the exit is at ±X.
  const sign = curveSign(t.type);
  const ccx = sign * (s / 2), ccy = -s / 2;
  const r = s / 2;
  const outer = r + roadW / 2;
  const inner = Math.max(0, r - roadW / 2);
  const a0 = sign > 0 ? Math.PI : 0;
  const a1 = Math.PI / 2;
  ctx.beginPath();
  ctx.arc(ccx, ccy, outer, a0, a1, sign > 0);
  ctx.arc(ccx, ccy, inner, a1, a0, sign < 0);
  ctx.closePath();
  ctx.fill();
}
