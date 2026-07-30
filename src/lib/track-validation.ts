// Poly Racer tile-based track model, connectivity walk + validation.
// Shared by editor, runner, thumbnail, and server-side validation.
// Legacy sine-wave tracks (v1) are detected via isLegacyTrack() and
// shown as read-only "legacy" entries so old saves don't crash the UI.
//
// ── Orientation convention ──────────────────────────────────────────
// `rot` is a rotation of the tile by rot × 90° about the Y axis, and it
// doubles as a grid direction index:
//
//   rot 0 → +Z   (down on the editor grid)
//   rot 1 → +X   (right)
//   rot 2 → -Z   (up)
//   rot 3 → -X   (left)
//
// A tile's `rot` is its *travel* direction: a car entering the tile
// moving in DIRS[rot] leaves through the tile's exit edge. Straights are
// symmetric (drivable both ways along their axis); curves connect the
// edge behind them to the edge on their left/right.
//
// ── Elevation convention ────────────────────────────────────────────
// `elev` is the height (in RAMP_H steps) of the tile at its *entry*
// edge — the edge facing -rot. Flat tiles sit at `elev` end to end.
// rampUp exits one step higher, rampDown one step lower. autoLevel()
// walks the track and rewrites every `elev` so the chain is consistent.

export type TileType =
  | "straight"
  | "curveL"
  | "curveR"
  | "rampUp"
  | "rampDown"
  | "jump"
  | "boost"
  | "start"
  | "finish"
  | "checkpoint";

export const TILE_TYPES: TileType[] = [
  "straight", "curveL", "curveR", "rampUp", "rampDown",
  "jump", "boost", "start", "finish", "checkpoint",
];

/** Tiles whose road runs straight along their local Z axis. */
export function isAxisTile(type: TileType): boolean {
  return type !== "curveL" && type !== "curveR";
}

export type Rot = 0 | 1 | 2 | 3;

export type Tile = {
  type: TileType;
  x: number;
  z: number;
  rot: Rot;
  elev?: number; // integer step, default 0
};

export type TrackData = {
  version: 2;
  tiles: Tile[];
};

/** Grid direction for each rot, as [dx, dz]. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
] as const;

export const opposite = (r: Rot): Rot => (((r + 2) % 4) as Rot);

/** Legacy v1 sine-wave params. Kept only for detection / graceful skip. */
export type LegacyTrackParams = {
  amp1: number; freq1: number; amp2: number; freq2: number; half: number; phase: number;
};

// Any-shape "params" blob stored in the DB, since older rows use v1.
export type StoredParams = TrackData | LegacyTrackParams | Record<string, unknown>;

export function isLegacyTrack(p: unknown): p is LegacyTrackParams {
  if (!p || typeof p !== "object") return true;
  const o = p as Record<string, unknown>;
  if ("tiles" in o && Array.isArray(o.tiles)) return false;
  return "amp1" in o || "freq1" in o;
}

export function isTrackData(p: unknown): p is TrackData {
  return !!p && typeof p === "object" && Array.isArray((p as { tiles?: unknown }).tiles);
}

export const GRID_MIN = -20;
export const GRID_MAX = 20;
export const MAX_TILES = 250;
export const MAX_ELEV = 6;

// ── Connectivity ────────────────────────────────────────────────────

/**
 * The two grid directions a tile's road opens onto. A car leaves through
 * one and entered through the other.
 */
export function tileEdges(t: Tile): [Rot, Rot] {
  const r = t.rot;
  // three.js is right-handed with Y up, so a car facing +Z has its right
  // hand pointing at -X: turning right steps the direction index down.
  if (t.type === "curveR") return [opposite(r), (((r + 3) % 4) as Rot)];
  if (t.type === "curveL") return [opposite(r), (((r + 1) % 4) as Rot)];
  return [opposite(r), r];
}

/**
 * Direction a car leaves this tile if it entered moving in `enterDir`,
 * or null when the tile has no opening facing back along `enterDir`
 * (i.e. the piece doesn't connect to where the car came from).
 */
export function exitDir(t: Tile, enterDir: Rot): Rot | null {
  const back = opposite(enterDir);
  const [a, b] = tileEdges(t);
  if (a === back) return b;
  if (b === back) return a;
  return null;
}

/** Whether `enterDir` runs with the tile's own arrow rather than against it. */
export function rotIsForward(t: Tile, enterDir: Rot): boolean {
  return enterDir === t.rot;
}

/** Elevation change across a tile when entered moving in `enterDir`. */
export function elevDelta(t: Tile, enterDir: Rot): number {
  if (t.type !== "rampUp" && t.type !== "rampDown") return 0;
  const forward = enterDir === t.rot;
  const up = t.type === "rampUp";
  return (up ? 1 : -1) * (forward ? 1 : -1);
}

export type TrackWalk = {
  /** Tiles in drive order, starting at the start tile. */
  path: Tile[];
  /** Entry direction used for each path entry. */
  dirs: Rot[];
  /** Entry elevation (in steps) for each path entry, as walked. */
  levels: number[];
  /** True when the walk reached the finish tile. */
  reachesFinish: boolean;
  /** Checkpoint tiles found along the path, in order. */
  checkpoints: Tile[];
  /** Checkpoint tiles that exist but are not on the drivable path. */
  strandedCheckpoints: Tile[];
  /** Human-readable reason the walk stopped early, if it did. */
  problem: string | null;
};

/**
 * Follow the track from the start tile, piece to piece, until the finish
 * is reached or the road runs out. This is what makes a layout drivable,
 * and it powers both the editor's warnings and autoLevel().
 */
export function walkTrack(data: TrackData): TrackWalk {
  const path: Tile[] = [];
  const dirs: Rot[] = [];
  const levels: number[] = [];
  const checkpoints: Tile[] = [];
  const out: TrackWalk = {
    path, dirs, levels, reachesFinish: false, checkpoints,
    strandedCheckpoints: [], problem: null,
  };

  const map = new Map<string, Tile>();
  for (const t of data.tiles) map.set(`${t.x},${t.z}`, t);
  const start = data.tiles.find((t) => t.type === "start");
  if (!start) { out.problem = "No start tile."; return out; }

  let tile: Tile | undefined = start;
  let dir: Rot = start.rot;
  let level = 0;
  const seen = new Set<string>();
  // A closed circuit may legitimately re-enter a tile from the other
  // side, so the guard is on (tile, direction) rather than tile alone.
  for (let guard = 0; guard < MAX_TILES * 4 && tile; guard++) {
    const key = `${tile.x},${tile.z}|${dir}`;
    if (seen.has(key)) { out.problem = "Track loops back on itself."; break; }
    seen.add(key);

    path.push(tile);
    dirs.push(dir);
    levels.push(level);
    if (tile.type === "checkpoint") checkpoints.push(tile);
    if (tile.type === "finish" && path.length > 1) { out.reachesFinish = true; break; }

    const next = exitDir(tile, dir);
    if (next == null) {
      out.problem = `Piece at ${tile.x},${tile.z} doesn't connect to the piece before it.`;
      break;
    }
    level += elevDelta(tile, dir);
    const [dx, dz] = DIRS[next];
    const nx = tile.x + dx, nz = tile.z + dz;
    const nextTile = map.get(`${nx},${nz}`);
    if (!nextTile) {
      out.problem = `Road ends at ${nx},${nz} — the track never reaches the finish.`;
      tile = undefined;
      break;
    }
    tile = nextTile;
    dir = next;
  }

  if (!out.reachesFinish && !out.problem) out.problem = "The finish is never reached.";
  const onPath = new Set(path.map((t) => `${t.x},${t.z}`));
  out.strandedCheckpoints = data.tiles.filter(
    (t) => t.type === "checkpoint" && !onPath.has(`${t.x},${t.z}`),
  );
  return out;
}

/**
 * Rewrite every tile's `elev` by walking the track so ramps chain into
 * their neighbours. Tiles off the drivable path keep what they had.
 * Returns a new TrackData; the input is untouched.
 */
export function autoLevel(data: TrackData): TrackData {
  const walk = walkTrack(data);
  const byCell = new Map<string, number>();
  let min = 0;
  for (let i = 0; i < walk.path.length; i++) {
    const t = walk.path[i];
    const lvl = walk.levels[i];
    // Ramps store their *entry* height; entering backwards means the low
    // end is one step down from where the walk currently sits.
    const back = walk.dirs[i] !== t.rot && (t.type === "rampUp" || t.type === "rampDown");
    const stored = back ? lvl + elevDelta(t, walk.dirs[i]) : lvl;
    byCell.set(`${t.x},${t.z}`, stored);
    if (lvl < min) min = lvl;
  }
  const lift = min < 0 ? -min : 0;
  return {
    version: 2,
    tiles: data.tiles.map((t) => {
      const v = byCell.get(`${t.x},${t.z}`);
      if (v == null) return t;
      const elev = Math.max(0, Math.min(MAX_ELEV, v + lift));
      return elev === 0 ? { ...t, elev: undefined } : { ...t, elev };
    }),
  };
}

// ── Validation ──────────────────────────────────────────────────────

const BAD_WORDS = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "asshole", "nigger",
  "faggot", "retard", "slut", "whore", "nazi", "kike", "chink", "spic",
  "porn", "cum", "sex",
];

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 3) return "Name must be at least 3 characters.";
  if (trimmed.length > 40) return "Name must be at most 40 characters.";
  if (!/^[a-zA-Z0-9 _\-'.!?]+$/.test(trimmed)) {
    return "Name can only use letters, numbers, spaces, and - _ ' . ! ?";
  }
  if (/(.)\1{4,}/.test(trimmed)) return "Name has too many repeated characters.";
  const lower = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  for (const w of BAD_WORDS) if (lower.includes(w)) return "Name contains a blocked word.";
  return null;
}

export function validateTrack(data: unknown): string | null {
  if (!isTrackData(data)) return "Invalid track format.";
  const tiles = data.tiles;
  if (tiles.length < 3) return "Track needs at least 3 tiles.";
  if (tiles.length > MAX_TILES) return `Track exceeds ${MAX_TILES} tiles.`;
  let start = 0, finish = 0;
  const seen = new Set<string>();
  for (const t of tiles) {
    if (!t || typeof t !== "object") return "Invalid tile.";
    if (typeof t.x !== "number" || typeof t.z !== "number") return "Tile missing coords.";
    if (!Number.isInteger(t.x) || !Number.isInteger(t.z)) return "Tile coords must be integers.";
    if (t.x < GRID_MIN || t.x > GRID_MAX || t.z < GRID_MIN || t.z > GRID_MAX) {
      return `Tile out of grid bounds (${GRID_MIN}..${GRID_MAX}).`;
    }
    if (![0, 1, 2, 3].includes(t.rot)) return "Tile rot must be 0..3.";
    if (!TILE_TYPES.includes(t.type)) return `Unknown tile type ${t.type}.`;
    if (t.elev != null && (!Number.isInteger(t.elev) || t.elev < 0 || t.elev > MAX_ELEV)) {
      return `Tile elevation must be 0..${MAX_ELEV}.`;
    }
    const key = `${t.x},${t.z}`;
    if (seen.has(key)) return `Duplicate tile at ${key}.`;
    seen.add(key);
    if (t.type === "start") start++;
    if (t.type === "finish") finish++;
  }
  if (start !== 1) return "Track must have exactly 1 start tile.";
  if (finish !== 1) return "Track must have exactly 1 finish tile.";
  return null;
}

/**
 * Editor-side drivability report. Kept separate from validateTrack() so
 * the server keeps accepting older layouts while the editor can still
 * tell the builder exactly what's wrong.
 */
export function analyzeTrack(data: TrackData): { error: string | null; warning: string | null; walk: TrackWalk } {
  const walk = walkTrack(data);
  const error = validateTrack(data);
  let warning: string | null = null;
  if (!error) {
    if (!walk.reachesFinish) warning = walk.problem;
    else if (walk.strandedCheckpoints.length > 0) {
      const n = walk.strandedCheckpoints.length;
      warning = `${n} checkpoint${n > 1 ? "s aren't" : " isn't"} on the drivable path — the track can't be finished.`;
    }
  }
  return { error, warning, walk };
}

export function validateForPublish(name: string, data: unknown): string | null {
  return validateName(name) ?? validateTrack(data);
}
