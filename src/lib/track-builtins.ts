// Poly Racer built-in tracks (tile-based v2 format).
//
// Layouts are described as a closed route of grid cells and then compiled
// into tiles: every piece's type and rotation is derived from the way the
// route actually turns, so built-ins are guaranteed to connect end to end.
import {
  autoLevel, walkTrack,
  type Rot, type Tile, type TileType, type TrackData,
} from "./track-validation";
import { TILE, type Season } from "./polytrack-engine";

export type BuiltinLevel = {
  id: number;
  name: string;
  season: Season;
  /** Author-medal target time, ms. */
  goal: number;
  data: TrackData;
};

type Pt = [number, number];

const dirIndex = (dx: number, dz: number): Rot => {
  if (dz > 0) return 0;
  if (dx > 0) return 1;
  if (dz < 0) return 2;
  return 3;
};

/** Does the route go straight through cell i (no turn)? */
function isStraightAt(cells: Pt[], i: number): boolean {
  const n = cells.length;
  const [x, z] = cells[((i % n) + n) % n];
  const [px, pz] = cells[((i - 1) % n + n) % n];
  const [nx, nz] = cells[(i + 1) % n];
  return dirIndex(x - px, z - pz) === dirIndex(nx - x, nz - z);
}

/**
 * Expand axis-aligned waypoints into every grid cell along the route.
 * `points` describes a closed circuit; the final point must repeat the
 * first, and the duplicate is dropped.
 *
 * The result is rotated so index 0 is a straight preceded by a straight —
 * the start line and the finish line right behind it both need flat road.
 */
function route(points: Pt[]): Pt[] {
  const cells: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    if (ax !== bx && az !== bz) {
      throw new Error(`route legs must be axis-aligned (${ax},${az})→(${bx},${bz})`);
    }
    const sx = Math.sign(bx - ax), sz = Math.sign(bz - az);
    let x = ax, z = az;
    // Push the leg start plus every cell up to (not including) the next
    // waypoint — the next leg contributes it as its own start.
    while (x !== bx || z !== bz) {
      cells.push([x, z]);
      x += sx; z += sz;
    }
  }
  for (let s = 0; s < cells.length; s++) {
    if (isStraightAt(cells, s) && isStraightAt(cells, s - 1)) {
      return [...cells.slice(s), ...cells.slice(0, s)];
    }
  }
  throw new Error("route has no straight run to put the start and finish on");
}

type Feature =
  | { at: number; type: Exclude<TileType, "start" | "finish" | "curveL" | "curveR" | "straight"> };

/** Compile a closed route into tiles, with features placed by route index. */
function compile(cells: Pt[], features: Feature[] = []): TrackData {
  const n = cells.length;
  const tiles: Tile[] = [];
  const straight: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const [x, z] = cells[i];
    const [prevX, prevZ] = cells[(i - 1 + n) % n];
    const [nextX, nextZ] = cells[(i + 1) % n];
    const inDir = dirIndex(x - prevX, z - prevZ);
    const outDir = dirIndex(nextX - x, nextZ - z);

    let type: TileType = "straight";
    if (outDir === (inDir + 1) % 4) type = "curveL";
    else if (outDir === (inDir + 3) % 4) type = "curveR";
    else if (outDir !== inDir) throw new Error(`route doubles back at ${x},${z}`);

    straight.push(type === "straight");
    tiles.push({ type, x, z, rot: inDir });
  }

  // Index 0 is the start line; the cell right before it is the finish, so
  // a lap ends where it began.
  const used = new Set<number>();
  const place = (i: number, type: TileType) => {
    const idx = ((i % n) + n) % n;
    if (!straight[idx]) throw new Error(`cannot place ${type} on a corner (index ${idx})`);
    if (used.has(idx)) throw new Error(`two features share route index ${idx}`);
    used.add(idx);
    tiles[idx] = { ...tiles[idx], type };
  };
  place(0, "start");
  place(n - 1, "finish");
  for (const f of features) place(f.at, f.type);

  return autoLevel({ version: 2, tiles });
}

/** Route index of the nearest straight to `frac` of the way round. */
function straightNear(cells: Pt[], frac: number): number {
  const n = cells.length;
  const target = Math.round(frac * n);
  for (let d = 0; d < n; d++) {
    for (const i of [target + d, target - d]) {
      const idx = ((i % n) + n) % n;
      if (idx !== 0 && idx !== n - 1 && isStraightAt(cells, idx)) return idx;
    }
  }
  return 1;
}

/**
 * Author-medal target: straights are taken near top speed, corners cost
 * time, and every ramp or jump adds a beat of air.
 */
function targetTime(data: TrackData): number {
  let seconds = 0;
  for (const t of data.tiles) {
    if (t.type === "curveL" || t.type === "curveR") seconds += TILE / 14;
    else seconds += TILE / 30;
    if (t.type === "rampUp" || t.type === "rampDown") seconds += 0.25;
    if (t.type === "jump") seconds += 0.5;
    if (t.type === "boost") seconds -= 0.15;
  }
  return Math.round((seconds + 1.2) * 1000);
}

function level(id: number, name: string, season: Season, cells: Pt[], features: Feature[]): BuiltinLevel {
  const data = compile(cells, features);
  const walk = walkTrack(data);
  if (!walk.reachesFinish) {
    throw new Error(`built-in "${name}" is not drivable: ${walk.problem ?? "unknown"}`);
  }
  return { id, name, season, goal: targetTime(data), data };
}

// ── Layouts ─────────────────────────────────────────────────────────

// 1 — a plain rectangle to learn the car on.
const SPROUT = route([[1, 1], [8, 1], [8, 6], [1, 6], [1, 1]]);

// 2 — long loop with a climb onto an elevated back straight.
const SUNBAKED = route([[1, 1], [10, 1], [10, 7], [1, 7], [1, 1]]);

// 3 — two hairpins stacked into a switchback.
const COPPER = route([
  [2, 2], [9, 2], [9, 4], [3, 4], [3, 6], [9, 6], [9, 8], [2, 8], [2, 2],
]);

// 4 — an out-and-back with a long middle spur.
const AMBER = route([
  [2, 1], [11, 1], [11, 4], [6, 4], [6, 7], [11, 7], [11, 10], [2, 10], [2, 1],
]);

// 5 — the grand tour: elevation, boosts and a jump.
const FROST = route([
  [1, 1], [14, 1], [14, 5], [9, 5], [9, 9], [14, 9], [14, 13], [1, 13], [1, 1],
]);

export const BUILTINS: BuiltinLevel[] = [
  level(1, "Sprout Loop", "spring", SPROUT, [
    { at: straightNear(SPROUT, 0.25), type: "checkpoint" },
    { at: straightNear(SPROUT, 0.5), type: "checkpoint" },
    { at: straightNear(SPROUT, 0.75), type: "checkpoint" },
  ]),
  level(2, "Sunbaked Rise", "summer", SUNBAKED, [
    { at: 3, type: "rampUp" },
    { at: straightNear(SUNBAKED, 0.25), type: "checkpoint" },
    { at: straightNear(SUNBAKED, 0.45), type: "rampDown" },
    { at: straightNear(SUNBAKED, 0.6), type: "checkpoint" },
    { at: straightNear(SUNBAKED, 0.78), type: "checkpoint" },
    { at: straightNear(SUNBAKED, 0.9), type: "boost" },
  ]),
  level(3, "Copper Coil", "fall", COPPER, [
    { at: straightNear(COPPER, 0.2), type: "checkpoint" },
    { at: straightNear(COPPER, 0.45), type: "checkpoint" },
    { at: straightNear(COPPER, 0.7), type: "checkpoint" },
    { at: straightNear(COPPER, 0.9), type: "boost" },
  ]),
  level(4, "Amber Twin", "fall", AMBER, [
    { at: 3, type: "boost" },
    { at: straightNear(AMBER, 0.2), type: "checkpoint" },
    { at: straightNear(AMBER, 0.4), type: "jump" },
    { at: straightNear(AMBER, 0.55), type: "checkpoint" },
    { at: straightNear(AMBER, 0.8), type: "checkpoint" },
  ]),
  level(5, "Frost Grand Tour", "winter", FROST, [
    { at: 4, type: "rampUp" },
    { at: straightNear(FROST, 0.15), type: "checkpoint" },
    { at: straightNear(FROST, 0.3), type: "rampDown" },
    { at: straightNear(FROST, 0.42), type: "checkpoint" },
    { at: straightNear(FROST, 0.58), type: "boost" },
    { at: straightNear(FROST, 0.68), type: "jump" },
    { at: straightNear(FROST, 0.8), type: "checkpoint" },
  ]),
];
