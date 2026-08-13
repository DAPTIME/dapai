/**
 * Pure editing model for the DAP Track level editor.
 *
 * The editor UI is deliberately thin: every mutation lives here as a pure
 * function over `EditorDoc`, so undo/redo is just a stack of documents and
 * every operation can be unit-reasoned about without a DOM.
 *
 * Nothing in this file talks to Supabase — persistence stays in
 * `src/lib/tracks.functions.ts`, which already owns validation and RLS.
 */
import {
  GRID_MAX,
  GRID_MIN,
  MAX_LEVEL,
  MAX_TILES,
  cellKey,
  type Rot,
  type Tile,
  type TileType,
  type TrackData,
} from "./track-validation";

export type Selection = string[]; // cellKey(x, y, z)

export interface EditorDoc {
  data: TrackData;
  selection: Selection;
}

export const keyOf = (t: Tile) => cellKey(t.x, t.y, t.z);

export const clampX = (n: number) => Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(n)));
export const clampLevel = (n: number) => Math.max(0, Math.min(MAX_LEVEL, Math.round(n)));

export function tileAt(tiles: Tile[], x: number, y: number, z: number): Tile | undefined {
  return tiles.find((t) => t.x === x && t.y === y && t.z === z);
}

/** Every deck stacked in one (x, z) column, lowest level first. */
export function columnsOf(data: TrackData): Map<string, Tile[]> {
  const m = new Map<string, Tile[]>();
  for (const t of data.tiles) {
    const k = `${t.x},${t.z}`;
    const col = m.get(k);
    if (col) col.push(t);
    else m.set(k, [t]);
  }
  for (const col of m.values()) col.sort((a, b) => a.y - b.y);
  return m;
}

const doc = (tiles: Tile[], selection: Selection): EditorDoc => ({
  data: { version: 3, tiles },
  selection,
});

/**
 * Paint one cell. Placing the piece that is already there (same type and
 * facing) spins it, which is how the original editor let you rotate without
 * leaving the paint tool.
 */
export function placeTile(
  d: EditorDoc,
  x: number,
  z: number,
  level: number,
  type: TileType,
  rot: Rot
): EditorDoc {
  if (x < GRID_MIN || x > GRID_MAX || z < GRID_MIN || z > GRID_MAX) return d;
  const here = tileAt(d.data.tiles, x, level, z);
  if (!here && d.data.tiles.length >= MAX_TILES) return d;

  let tiles = d.data.tiles.filter((t) => t !== here);
  // Start and finish are unique — placing a new one relocates it.
  if (type === "start") tiles = tiles.filter((t) => t.type !== "start");
  if (type === "finish") tiles = tiles.filter((t) => t.type !== "finish");

  const placed: Tile =
    here && here.type === type && here.rot === rot
      ? { ...here, rot: (((here.rot + 1) % 4) as Rot) }
      : { type, x, y: level, z, rot };
  tiles.push(placed);
  return doc(tiles, [keyOf(placed)]);
}

/** Erase on the working level, falling back to the topmost deck. */
export function eraseAt(d: EditorDoc, x: number, z: number, level: number): EditorDoc {
  const here = tileAt(d.data.tiles, x, level, z);
  const target =
    here ??
    d.data.tiles.filter((t) => t.x === x && t.z === z).sort((a, b) => b.y - a.y)[0];
  if (!target) return d;
  const gone = keyOf(target);
  return doc(
    d.data.tiles.filter((t) => t !== target),
    d.selection.filter((k) => k !== gone)
  );
}

export function selectedTiles(d: EditorDoc): Tile[] {
  const set = new Set(d.selection);
  return d.data.tiles.filter((t) => set.has(keyOf(t)));
}

export function setSelection(d: EditorDoc, selection: Selection): EditorDoc {
  return { ...d, selection };
}

/** Move the selection, evicting anything it lands on top of. */
export function moveSelection(d: EditorDoc, dx: number, dz: number, dy = 0): EditorDoc {
  const moving = selectedTiles(d);
  if (moving.length === 0) return d;
  const set = new Set(d.selection);

  for (const t of moving) {
    const nx = t.x + dx;
    const nz = t.z + dz;
    const ny = t.y + dy;
    if (nx < GRID_MIN || nx > GRID_MAX || nz < GRID_MIN || nz > GRID_MAX) return d;
    if (ny < 0 || ny > MAX_LEVEL) return d;
  }

  const movedKeys = new Set(moving.map((t) => cellKey(t.x + dx, t.y + dy, t.z + dz)));
  const rest = d.data.tiles.filter((t) => !set.has(keyOf(t)) && !movedKeys.has(keyOf(t)));
  const moved = moving.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy, z: t.z + dz }));
  return doc([...rest, ...moved], moved.map(keyOf));
}

export function rotateSelection(d: EditorDoc, step: 1 | -1 = 1): EditorDoc {
  const set = new Set(d.selection);
  if (set.size === 0) return d;
  const tiles = d.data.tiles.map((t) =>
    set.has(keyOf(t)) ? { ...t, rot: (((t.rot + (step === 1 ? 1 : 3)) % 4) as Rot) } : t
  );
  return doc(tiles, d.selection);
}

export function retypeSelection(d: EditorDoc, type: TileType): EditorDoc {
  const set = new Set(d.selection);
  if (set.size === 0) return d;
  let tiles = d.data.tiles.map((t) => (set.has(keyOf(t)) ? { ...t, type } : t));
  if (type === "start" || type === "finish") {
    // Keep uniqueness: only the last retyped piece survives as start/finish.
    const chosen = tiles.filter((t) => t.type === type).pop();
    tiles = tiles.filter((t) => t.type !== type || t === chosen);
  }
  return doc(tiles, d.selection.slice());
}

export function deleteSelection(d: EditorDoc): EditorDoc {
  const set = new Set(d.selection);
  if (set.size === 0) return d;
  return doc(d.data.tiles.filter((t) => !set.has(keyOf(t))), []);
}

/** Copy the selection one cell down-right so the clone is visible. */
export function duplicateSelection(d: EditorDoc, dx = 1, dz = 1): EditorDoc {
  const source = selectedTiles(d);
  if (source.length === 0) return d;
  if (d.data.tiles.length + source.length > MAX_TILES) return d;

  const clones: Tile[] = [];
  for (const t of source) {
    const nx = clampX(t.x + dx);
    const nz = clampX(t.z + dz);
    // Start and finish are unique, so a duplicate becomes plain road.
    const type: TileType = t.type === "start" || t.type === "finish" ? "straight" : t.type;
    clones.push({ ...t, type, x: nx, z: nz });
  }
  const cloneKeys = new Set(clones.map(keyOf));
  const rest = d.data.tiles.filter((t) => !cloneKeys.has(keyOf(t)));
  return doc([...rest, ...clones], clones.map(keyOf));
}

/** Rewrite one tile from the properties panel. */
export function updateTile(d: EditorDoc, key: string, patch: Partial<Tile>): EditorDoc {
  const target = d.data.tiles.find((t) => keyOf(t) === key);
  if (!target) return d;
  const next: Tile = {
    ...target,
    ...patch,
    x: clampX(patch.x ?? target.x),
    z: clampX(patch.z ?? target.z),
    y: clampLevel(patch.y ?? target.y),
  };
  const nextKey = keyOf(next);
  let tiles = d.data.tiles.filter((t) => t !== target && keyOf(t) !== nextKey);
  if (next.type === "start") tiles = tiles.filter((t) => t.type !== "start");
  if (next.type === "finish") tiles = tiles.filter((t) => t.type !== "finish");
  tiles.push(next);
  return doc(tiles, [nextKey]);
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export function normalizeRect(r: Rect): Rect {
  return {
    x0: Math.min(r.x0, r.x1),
    x1: Math.max(r.x0, r.x1),
    z0: Math.min(r.z0, r.z1),
    z1: Math.max(r.z0, r.z1),
  };
}

/** Marquee select — restricted to the working level, like the level tools. */
export function tilesInRect(data: TrackData, rect: Rect, level: number): Tile[] {
  const r = normalizeRect(rect);
  return data.tiles.filter(
    (t) => t.y === level && t.x >= r.x0 && t.x <= r.x1 && t.z >= r.z0 && t.z <= r.z1
  );
}

/** Bounding box of the whole track — used to frame the camera on open. */
export function trackBounds(data: TrackData): Rect | null {
  if (data.tiles.length === 0) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const t of data.tiles) {
    x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x);
    z0 = Math.min(z0, t.z); z1 = Math.max(z1, t.z);
  }
  return { x0, x1, z0, z1 };
}

export const EMPTY_DOC: EditorDoc = { data: { version: 3, tiles: [] }, selection: [] };

export const STARTER_DOC: EditorDoc = {
  data: {
    version: 3,
    tiles: [
      { type: "start", x: 0, y: 0, z: 0, rot: 1 },
      { type: "straight", x: 1, y: 0, z: 0, rot: 1 },
      { type: "straight", x: 2, y: 0, z: 0, rot: 1 },
      { type: "finish", x: 3, y: 0, z: 0, rot: 1 },
    ],
  },
  selection: [],
};
