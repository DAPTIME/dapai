// DAP Track shared engine: themes, tile geometry constants, the surface
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
  /** Terrain plane. Bright and saturated — the track reads against it. */
  ground: string;
  /** Tarmac surface. Grey in every season, as asphalt is. */
  road: string;
  /** Flanks and underside of the slab, a shade down from the surface. */
  roadSide: string;
  /** Painted edge lines. */
  roadLine: string;
  label: string;
  emoji: string;
  sky: string;
  /** Pillars holding up raised road. */
  support: string;
  /** Scatter props dotted around the terrain. */
  prop: string;
};

/**
 * Flat, high-key palettes. The look is a bright day with no haze: one
 * solid colour per surface, nothing muddy, nothing textured.
 *
 * The season owns the ground and the sky — those two carry the whole
 * identity, so each pair is pushed far from the others: vivid grass under
 * a soft blue, gold sand under a hot azure, rust leaf-litter under an
 * amber haze, and snow under pale ice. The tarmac stays the same grey
 * family throughout, with only a hair of colour temperature, so a track
 * reads the same way wherever it is set.
 */
export const THEMES: Record<Season, Theme> = {
  spring: { ground: "#4fc23c", sky: "#9edcf7", road: "#83898f", roadSide: "#545a60", roadLine: "#f6fafb", support: "#4c5257", prop: "#1f8e3d", label: "Spring", emoji: "🌱" },
  summer: { ground: "#f0c552", sky: "#4dbde9", road: "#8a8f92", roadSide: "#585d60", roadLine: "#fdfaef", support: "#50555a", prop: "#d6862c", label: "Summer", emoji: "🏜️" },
  fall:   { ground: "#d4701f", sky: "#ffbb6b", road: "#82878c", roadSide: "#53585d", roadLine: "#fbf6ec", support: "#4b5055", prop: "#9c2f14", label: "Fall",   emoji: "🍂" },
  // Winter's snow and sky were within a few percent of each other in
  // value, so the horizon disappeared and the track read as floating on
  // nothing. The sky is deeper and the snow carries a little more blue,
  // which separates them without losing the cold, bright look.
  winter: { ground: "#e2edf9", sky: "#8fcdf2", road: "#868e96", roadSide: "#525960", roadLine: "#ffffff", support: "#4a5158", prop: "#2f7a5c", label: "Winter", emoji: "❄️" },
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

/** Gate colours, matching the 3D track so a card previews the real thing. */
const MARK_START = "#2fbf4a";
const MARK_FINISH_LIGHT = "#f2f4f5";
const MARK_FINISH_DARK = "#1c2024";
const MARK_CHECKPOINT = "#2f80ed";
const MARK_BOOST = "#22d3ee";
const MARK_JUMP = "#f7c948";

/** Road width in thumbnail pixels, as a fraction of one tile. */
const THUMB_ROAD = (ROAD_HALF * 2) / TILE;

/** Small top-down 2D thumbnail of a tile track. Not the 3D renderer. */
export function drawTrackThumbnail(
  ctx: CanvasRenderingContext2D,
  input: TrackData | null,
  season: Season,
  width: number,
  height: number,
): void {
  const theme = THEMES[season];
  ctx.save();
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, width, height);
  const data = toTrackData(input);
  if (!data || data.tiles.length === 0) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.font = "12px sans-serif";
    ctx.fillText("legacy track", 8, 18);
    ctx.restore();
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
  // Keep a margin of clear ground inside the frame: a card thumbnail that
  // runs into its own edge looks cropped even when it isn't.
  const s = Math.min((width * 0.9) / gw, (height * 0.9) / gh);
  const ox = (width - gw * s) / 2 - minX * s;
  const oy = (height - gh * s) / 2 - minZ * s;

  const px = (x: number) => ox + x * s;
  const py = (z: number) => oy + z * s;

  // Three bands make the road crisp: a dark kerb, the painted edge line,
  // then the tarmac itself. Each is one path per deck, so the seams
  // between neighbouring pieces vanish and only the road's own outline
  // is drawn.
  const roadW = s * THUMB_ROAD;
  const lineW = roadW + 2 * Math.max(1.1, s * 0.05);
  const kerbW = Math.min(s, lineW + 2 * Math.max(1.2, s * 0.055));

  const decks = new Map<number, Tile[]>();
  for (const t of data.tiles) {
    const deck = decks.get(t.y);
    if (deck) deck.push(t); else decks.set(t.y, [t]);
  }

  // Low decks first, so a flyover — shadow and all — lands on top of the
  // road it crosses.
  for (const level of [...decks.keys()].sort((a, b) => a - b)) {
    const deck = decks.get(level) ?? [];
    if (level > 0) {
      const drop = s * 0.13 * level;
      ctx.save();
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = "#000000";
      ctx.translate(drop, drop);
      fillDeck(ctx, deck, px, py, s, kerbW);
      ctx.restore();
    }
    ctx.fillStyle = lift(theme.roadSide, Math.min(0.3, level * 0.1));
    fillDeck(ctx, deck, px, py, s, kerbW);
    ctx.fillStyle = theme.roadLine;
    fillDeck(ctx, deck, px, py, s, lineW);
    ctx.fillStyle = level > 0 ? lift(theme.road, Math.min(0.42, level * 0.15)) : theme.road;
    fillDeck(ctx, deck, px, py, s, roadW);
    for (const t of deck) drawTileMark(ctx, t, px, py, s, roadW);
  }
  ctx.restore();
}

/** Lighten a hex colour toward white — raised decks read brighter. */
function lift(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * Fill every piece of one deck as a single path of width `w`. Pieces
 * never overlap within a deck, so one fill draws the whole ribbon with
 * no seams and no doubled-up alpha.
 */
function fillDeck(
  ctx: CanvasRenderingContext2D,
  deck: Tile[],
  px: (x: number) => number,
  py: (z: number) => number,
  s: number,
  w: number,
) {
  ctx.beginPath();
  for (const t of deck) {
    ctx.save();
    ctx.translate(px(t.x) + s / 2, py(t.z) + s / 2);
    // Canvas Y grows downward, so a +rot Y-rotation is a -rot canvas turn.
    ctx.rotate((-t.rot * Math.PI) / 2);
    addRoad(ctx, t, w, s);
    ctx.restore();
  }
  ctx.fill();
}

/** Adds one piece's road band to the current path, in its local frame. */
function addRoad(ctx: CanvasRenderingContext2D, t: Tile, w: number, s: number) {
  if (t.type !== "curveL" && t.type !== "curveR") {
    ctx.rect(-w / 2, -s / 2, w, s);
    return;
  }
  // Quarter annulus centred on the corner the bend hugs. In local space
  // the entry edge is at -Z (canvas -Y) and the exit is at ±X.
  const sign = curveSign(t.type);
  const ccx = sign * (s / 2), ccy = -s / 2;
  const r = s / 2;
  const outer = r + w / 2;
  const inner = Math.max(0, r - w / 2);
  const a0 = sign > 0 ? Math.PI : 0;
  const a1 = Math.PI / 2;
  ctx.moveTo(ccx + Math.cos(a0) * outer, ccy + Math.sin(a0) * outer);
  ctx.arc(ccx, ccy, outer, a0, a1, sign > 0);
  ctx.arc(ccx, ccy, inner, a1, a0, sign < 0);
  ctx.closePath();
}

/** Two forward-pointing chevrons, used for ramps, jumps and boosts. */
function chevrons(ctx: CanvasRenderingContext2D, roadW: number, s: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.1, s * 0.07);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const off of [-0.28, 0.0]) {
    ctx.beginPath();
    ctx.moveTo(-roadW * 0.3, s * off);
    ctx.lineTo(0, s * off + s * 0.2);
    ctx.lineTo(roadW * 0.3, s * off);
    ctx.stroke();
  }
}

/** Gates, boost pads and ramp arrows, painted on top of the tarmac. */
function drawTileMark(
  ctx: CanvasRenderingContext2D,
  t: Tile,
  px: (x: number) => number,
  py: (z: number) => number,
  s: number,
  roadW: number,
) {
  if (t.type === "straight" || t.type === "curveL" || t.type === "curveR") return;

  ctx.save();
  ctx.translate(px(t.x) + s / 2, py(t.z) + s / 2);
  ctx.rotate((-t.rot * Math.PI) / 2);

  if (t.type === "start") {
    ctx.fillStyle = MARK_START;
    ctx.fillRect(-roadW / 2, -Math.max(1.5, s * 0.09), roadW, Math.max(3, s * 0.18));
  } else if (t.type === "finish") {
    // Chequered band, the same flag the 3D finish gate flies.
    const cols = 4, rows = 2;
    const band = Math.max(3.2, s * 0.2);
    const cw = roadW / cols, ch = band / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? MARK_FINISH_LIGHT : MARK_FINISH_DARK;
        ctx.fillRect(-roadW / 2 + c * cw, -band / 2 + r * ch, cw + 0.35, ch + 0.35);
      }
    }
  } else if (t.type === "checkpoint") {
    ctx.fillStyle = MARK_CHECKPOINT;
    ctx.fillRect(-roadW / 2, -Math.max(1.2, s * 0.07), roadW, Math.max(2.4, s * 0.14));
  } else if (t.type === "boost") {
    ctx.fillStyle = MARK_BOOST;
    ctx.fillRect(-roadW / 2, -s / 2, roadW, s);
    chevrons(ctx, roadW, s, "rgba(255,255,255,0.92)");
  } else if (t.type === "jump") {
    ctx.fillStyle = MARK_JUMP;
    ctx.fillRect(-roadW / 2, s * 0.2, roadW, Math.max(2.2, s * 0.16));
    chevrons(ctx, roadW, s, "rgba(255,255,255,0.85)");
  } else if (isRamp(t.type)) {
    chevrons(ctx, roadW, s, t.type === "rampUp" ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.32)");
  }

  ctx.restore();
}
