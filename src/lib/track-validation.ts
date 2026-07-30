// Poly Racer tile-based track model, connectivity walk + validation.
// Shared by editor, runner, thumbnail, and server-side validation.
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
// edge behind them to the edge on their left/right. The world is
// right-handed with Y up, so a car facing +Z turns right toward -X.
//
// ── The grid is 3D ──────────────────────────────────────────────────
// A tile sits at an integer cell (x, y, z); `y` is its level, and a level
// is RAMP_H world units tall. Two pieces may share an (x, z) column as
// long as their levels differ — that is what makes overpasses, spirals
// and figure-eights possible.
//
// `y` is the height at the tile's *entry* edge (the edge facing -rot).
// Flat pieces sit at `y` end to end; rampUp exits one level higher and
// rampDown one lower, so the piece they feed into lives at that level.
// autoLevel() walks the track and rewrites every `y` so the chain joins
// up, which is also how a hand-built track gets its levels repaired.

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

/** Pieces that change level between their entry and exit edge. */
export function isRamp(type: TileType): boolean {
  return type === "rampUp" || type === "rampDown";
}

export type Rot = 0 | 1 | 2 | 3;

export type Tile = {
  type: TileType;
  x: number;
  /** Integer level. Height at the tile's entry edge. */
  y: number;
  z: number;
  rot: Rot;
};

export type TrackData = {
  version: 3;
  tiles: Tile[];
};

/** Grid direction for each rot, as [dx, dz]. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
] as const;

export const opposite = (r: Rot): Rot => (((r + 2) % 4) as Rot);

export const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const columnKey = (x: number, z: number) => `${x},${z}`;

export const GRID_MIN = -24;
export const GRID_MAX = 24;
export const MAX_TILES = 400;
export const MAX_LEVEL = 8;

// ── Reading stored tracks ───────────────────────────────────────────
// v1 was a sine-wave blob, v2 was a flat (x, z) grid with an optional
// `elev`. Both are readable; v2 lifts straight into v3 because `elev`
// meant exactly what `y` means now.

export type LegacyTrackParams = {
  amp1: number; freq1: number; amp2: number; freq2: number; half: number; phase: number;
};

export type StoredParams = TrackData | LegacyTrackParams | Record<string, unknown>;

export function isLegacyTrack(p: unknown): p is LegacyTrackParams {
  if (!p || typeof p !== "object") return true;
  const o = p as Record<string, unknown>;
  if ("tiles" in o && Array.isArray(o.tiles)) return false;
  return "amp1" in o || "freq1" in o;
}

/** True for anything tile-shaped — v2 or v3. */
export function isTrackData(p: unknown): p is TrackData {
  return !!p && typeof p === "object" && Array.isArray((p as { tiles?: unknown }).tiles);
}

/**
 * Read a stored track into the current model, lifting v2's flat `elev`
 * grid into levels. Returns null for anything that isn't tile-based.
 */
export function toTrackData(p: unknown): TrackData | null {
  if (!isTrackData(p)) return null;
  const raw = (p as { tiles: unknown[] }).tiles;
  const tiles: Tile[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") return null;
    const o = t as Record<string, unknown>;
    const level = typeof o.y === "number" ? o.y : typeof o.elev === "number" ? o.elev : 0;
    if (typeof o.x !== "number" || typeof o.z !== "number") return null;
    tiles.push({
      type: o.type as TileType,
      x: o.x,
      y: level,
      z: o.z,
      rot: (o.rot as Rot) ?? 0,
    });
  }
  return { version: 3, tiles };
}

// ── Connectivity ────────────────────────────────────────────────────

/**
 * The two grid directions a tile's road opens onto. A car leaves through
 * one and entered through the other.
 */
export function tileEdges(t: Tile): [Rot, Rot] {
  const r = t.rot;
  if (t.type === "curveR") return [opposite(r), (((r + 3) % 4) as Rot)];
  if (t.type === "curveL") return [opposite(r), (((r + 1) % 4) as Rot)];
  return [opposite(r), r];
}

/**
 * Direction a car leaves this tile if it entered moving in `enterDir`,
 * or null when the tile has no opening facing back along `enterDir`.
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

/** Level change across a tile when entered moving in `enterDir`. */
export function levelDelta(t: Tile, enterDir: Rot): number {
  if (!isRamp(t.type)) return 0;
  const forward = enterDir === t.rot;
  return (t.type === "rampUp" ? 1 : -1) * (forward ? 1 : -1);
}

/** Level of a tile's exit edge, entering it in `enterDir`. */
export function exitLevel(t: Tile, enterDir: Rot): number {
  // `y` is the entry-edge level, so driving a ramp backwards means the
  // stored level belongs to the edge we are leaving through.
  return rotIsForward(t, enterDir) ? t.y + levelDelta(t, enterDir) : t.y;
}

/** Level of a tile's entry edge, entering it in `enterDir`. */
export function entryLevel(t: Tile, enterDir: Rot): number {
  return rotIsForward(t, enterDir) ? t.y : t.y + (isRamp(t.type) ? -levelDelta(t, enterDir) : 0);
}

export type TrackWalk = {
  /** Tiles in drive order, starting at the start tile. */
  path: Tile[];
  /** Entry direction used for each path entry. */
  dirs: Rot[];
  /** Entry-edge level for each path entry, as walked. */
  levels: number[];
  reachesFinish: boolean;
  checkpoints: Tile[];
  /** Checkpoint tiles that exist but are not on the drivable path. */
  strandedCheckpoints: Tile[];
  /** Human-readable reason the walk stopped early, if it did. */
  problem: string | null;
};

type WalkOptions = {
  /**
   * Ignore stored levels when choosing the next piece, resolving by
   * column instead. autoLevel() uses this so it can repair a track whose
   * levels don't line up yet.
   */
  byColumn?: boolean;
};

/**
 * Follow the track from the start tile, piece to piece, until the finish
 * is reached or the road runs out. This is what makes a layout drivable,
 * and it powers both the editor's warnings and autoLevel().
 */
export function walkTrack(data: TrackData, opts: WalkOptions = {}): TrackWalk {
  const path: Tile[] = [];
  const dirs: Rot[] = [];
  const levels: number[] = [];
  const checkpoints: Tile[] = [];
  const out: TrackWalk = {
    path, dirs, levels, reachesFinish: false, checkpoints,
    strandedCheckpoints: [], problem: null,
  };

  const byCell = new Map<string, Tile>();
  const byColumn = new Map<string, Tile[]>();
  for (const t of data.tiles) {
    byCell.set(cellKey(t.x, t.y, t.z), t);
    const col = byColumn.get(columnKey(t.x, t.z));
    if (col) col.push(t); else byColumn.set(columnKey(t.x, t.z), [t]);
  }

  const start = data.tiles.find((t) => t.type === "start");
  if (!start) { out.problem = "No start piece."; return out; }

  let tile: Tile | undefined = start;
  let dir: Rot = start.rot;
  let level = start.y;
  const visited = new Set<Tile>();
  // A circuit may legitimately re-enter a column from the other side, so
  // the loop guard is on (tile, direction) rather than on the tile alone.
  const seen = new Set<string>();

  for (let guard = 0; guard < MAX_TILES * 4 && tile; guard++) {
    const key = `${cellKey(tile.x, tile.y, tile.z)}|${dir}`;
    if (seen.has(key)) { out.problem = "The track loops back onto itself."; break; }
    seen.add(key);
    visited.add(tile);

    path.push(tile);
    dirs.push(dir);
    levels.push(level);
    if (tile.type === "checkpoint") checkpoints.push(tile);
    if (tile.type === "finish" && path.length > 1) { out.reachesFinish = true; break; }

    const next = exitDir(tile, dir);
    if (next == null) {
      out.problem = `The piece at ${tile.x},${tile.z} doesn't connect to the one before it.`;
      break;
    }
    const outLevel = opts.byColumn
      ? level + levelDelta(tile, dir)
      : exitLevel(tile, dir);
    const [dx, dz] = DIRS[next];
    // Annotated so the loop's "tile = nextTile" doesn't make these
    // depend circularly on their own inferred type.
    const nx: number = tile.x + dx;
    const nz: number = tile.z + dz;

    let nextTile: Tile | undefined;
    if (opts.byColumn) {
      const col: Tile[] = byColumn.get(columnKey(nx, nz)) ?? [];
      // Prefer a piece we haven't driven yet, so a crossing resolves to
      // the other deck rather than doubling back onto this one.
      nextTile = col.find((c: Tile) => !visited.has(c)) ?? col[0];
    } else {
      nextTile = byCell.get(cellKey(nx, outLevel, nz));
      if (!nextTile && (byColumn.get(columnKey(nx, nz)) ?? []).length > 0) {
        out.problem = `The piece at ${nx},${nz} is at the wrong level — run Auto-level.`;
        tile = undefined;
        break;
      }
    }
    if (!nextTile) {
      out.problem = `The road ends at ${nx},${nz} — the track never reaches the finish.`;
      tile = undefined;
      break;
    }
    tile = nextTile;
    dir = next;
    level = outLevel;
  }

  if (!out.reachesFinish && !out.problem) out.problem = "The finish is never reached.";
  const onPath = new Set(path);
  out.strandedCheckpoints = data.tiles.filter((t) => t.type === "checkpoint" && !onPath.has(t));
  return out;
}

/**
 * Rewrite every tile's level by walking the track so ramps chain into
 * their neighbours. Pieces off the drivable path keep what they had.
 * Returns new TrackData; the input is untouched.
 */
export function autoLevel(data: TrackData): TrackData {
  const walk = walkTrack(data, { byColumn: true });
  const assigned = new Map<Tile, number>();
  let min = 0;
  for (let i = 0; i < walk.path.length; i++) {
    const t = walk.path[i];
    if (assigned.has(t)) continue;
    const lvl = walk.levels[i];
    // Ramps store their entry-edge level; entering one backwards means
    // the stored level belongs to the edge we leave through.
    const backwards = isRamp(t.type) && walk.dirs[i] !== t.rot;
    const stored = backwards ? lvl + levelDelta(t, walk.dirs[i]) : lvl;
    assigned.set(t, stored);
    if (stored < min) min = stored;
    if (lvl < min) min = lvl;
  }
  const lift = min < 0 ? -min : 0;
  return {
    version: 3,
    tiles: data.tiles.map((t) => {
      const v = assigned.get(t);
      if (v == null) return t;
      return { ...t, y: Math.max(0, Math.min(MAX_LEVEL, v + lift)) };
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

export function validateTrack(input: unknown): string | null {
  const data = toTrackData(input);
  if (!data) return "Invalid track format.";
  const tiles = data.tiles;
  if (tiles.length < 3) return "Track needs at least 3 pieces.";
  if (tiles.length > MAX_TILES) return `Track exceeds ${MAX_TILES} pieces.`;
  let start = 0, finish = 0;
  const seen = new Set<string>();
  for (const t of tiles) {
    if (typeof t.x !== "number" || typeof t.z !== "number" || typeof t.y !== "number") {
      return "Piece is missing coordinates.";
    }
    if (!Number.isInteger(t.x) || !Number.isInteger(t.z) || !Number.isInteger(t.y)) {
      return "Piece coordinates must be whole numbers.";
    }
    if (t.x < GRID_MIN || t.x > GRID_MAX || t.z < GRID_MIN || t.z > GRID_MAX) {
      return `Piece out of grid bounds (${GRID_MIN}..${GRID_MAX}).`;
    }
    if (t.y < 0 || t.y > MAX_LEVEL) return `Piece level must be 0..${MAX_LEVEL}.`;
    if (![0, 1, 2, 3].includes(t.rot)) return "Piece rotation must be 0..3.";
    if (!TILE_TYPES.includes(t.type)) return `Unknown piece type ${t.type}.`;
    const key = cellKey(t.x, t.y, t.z);
    if (seen.has(key)) return `Two pieces share cell ${t.x},${t.z} on level ${t.y}.`;
    seen.add(key);
    if (t.type === "start") start++;
    if (t.type === "finish") finish++;
  }
  if (start !== 1) return "Track must have exactly 1 start piece.";
  if (finish !== 1) return "Track must have exactly 1 finish piece.";
  return null;
}

/**
 * Editor-side drivability report. Kept separate from validateTrack() so
 * the server keeps accepting older layouts while the editor can tell the
 * builder exactly which piece breaks the chain.
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
