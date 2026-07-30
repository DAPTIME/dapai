// Poly Racer built-in tracks.
//
// Layouts are described as a closed route of grid cells and compiled into
// pieces: every piece's type and rotation is derived from the way the
// route actually turns, and its level from where the ramps sit. A route
// may cross itself — the crossing becomes an overpass as long as a ramp
// lifts one pass above the other, which autoLevel() works out.
import {
  autoLevel, walkTrack, validateTrack,
  type Rot, type Tile, type TileType, type TrackData,
} from "./track-validation";
import { TILE, LEVEL_H, type Season } from "./polytrack-engine";

export type Difficulty = "easy" | "medium" | "hard";

export type BuiltinLevel = {
  id: number;
  name: string;
  season: Season;
  difficulty: Difficulty;
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

/** Piece types that can be dropped onto a straight run of road. */
type FeatureType = Exclude<TileType, "start" | "finish" | "curveL" | "curveR" | "straight">;

type Feature = {
  type: FeatureType;
  /** Grid cell to place it on… */
  cell?: Pt;
  /** …and which visit to that cell, when the route crosses itself. */
  nth?: number;
  /** …or, instead, the nearest straight this far round the lap. */
  frac?: number;
};

type Shape = { cells: Pt[]; features: Feature[] };

/** Does the route go straight through cell i (no turn)? */
function isStraightAt(cells: Pt[], i: number): boolean {
  const n = cells.length;
  const [x, z] = cells[((i % n) + n) % n];
  const [px, pz] = cells[(((i - 1) % n) + n) % n];
  const [nx, nz] = cells[(i + 1) % n];
  return dirIndex(x - px, z - pz) === dirIndex(nx - x, nz - z);
}

/**
 * Expand axis-aligned waypoints into every grid cell along the route.
 * `points` describes a closed circuit; the final point repeats the first,
 * and the duplicate is dropped.
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
    while (x !== bx || z !== bz) {
      cells.push([x, z]);
      x += sx; z += sz;
    }
  }
  return cells;
}

/**
 * Rotate the route so index 0 is plain road: a straight, preceded by a
 * straight, visited only once, and not already claimed by a feature.
 * The start line and the finish line right behind it both need that.
 *
 * Keeping index 0 at the start also keeps the compiled tile array in
 * drive order, which is how autoLevel() tells the two decks of a
 * crossing apart.
 */
function startOffset(cells: Pt[], featureIdx: Set<number>): number {
  const n = cells.length;
  const visits = new Map<string, number>();
  for (const [x, z] of cells) visits.set(`${x},${z}`, (visits.get(`${x},${z}`) ?? 0) + 1);
  const plain = (i: number) =>
    isStraightAt(cells, i) && visits.get(`${cells[i][0]},${cells[i][1]}`) === 1 && !featureIdx.has(i);

  for (let s = 0; s < n; s++) {
    if (plain(s) && plain((s - 1 + n) % n)) return s;
  }
  throw new Error("route has no free straight to put the start and finish on");
}

/** Compile a closed route into pieces, then settle the levels. */
function compile(shape: Shape): TrackData {
  const n = shape.cells.length;
  // Pin features to the raw route first — exact cells win, then anything
  // placed by fraction takes the nearest straight still going spare.
  const taken = new Set<number>();
  const rawIdx: number[] = new Array(shape.features.length);
  shape.features.forEach((f, i) => {
    if (!f.cell) return;
    const idx = featureIndex(shape.cells, f);
    if (taken.has(idx)) throw new Error(`two features want cell ${f.cell}`);
    taken.add(idx);
    rawIdx[i] = idx;
  });
  shape.features.forEach((f, i) => {
    if (f.cell) return;
    const idx = freeStraightNear(shape.cells, f.frac ?? 0.5, taken);
    taken.add(idx);
    rawIdx[i] = idx;
  });

  // Then spin the route so the start line lands on road nothing wants.
  const offset = startOffset(shape.cells, taken);
  const cells = [...shape.cells.slice(offset), ...shape.cells.slice(0, offset)];
  const featureAt = shape.features.map((f, i) => ({ type: f.type, idx: (rawIdx[i] - offset + n) % n }));

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
    tiles.push({ type, x, y: 0, z, rot: inDir });
  }

  const used = new Set<number>();
  const place = (i: number, type: TileType) => {
    const idx = ((i % n) + n) % n;
    if (!straight[idx]) throw new Error(`cannot put ${type} on a corner (${cells[idx]})`);
    if (used.has(idx)) throw new Error(`two features share route index ${idx} (${cells[idx]})`);
    used.add(idx);
    tiles[idx] = { ...tiles[idx], type };
  };

  // Index 0 is the start line; the cell right before it is the finish, so
  // a lap ends where it began.
  place(0, "start");
  place(n - 1, "finish");
  for (const f of featureAt) place(f.idx, f.type);

  return autoLevel({ version: 3, tiles });
}

function featureIndex(cells: Pt[], f: Feature): number {
  if (!f.cell) return freeStraightNear(cells, f.frac ?? 0.5, new Set());
  const [fx, fz] = f.cell;
  let seen = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i][0] === fx && cells[i][1] === fz) {
      if (seen === (f.nth ?? 0)) return i;
      seen++;
    }
  }
  throw new Error(`no cell ${fx},${fz} (visit ${f.nth ?? 0}) on this route`);
}

/**
 * Route index of the nearest unclaimed straight to `frac` of the way
 * round, searching outward from there.
 */
function freeStraightNear(cells: Pt[], frac: number, taken: Set<number>): number {
  const n = cells.length;
  const target = Math.round(frac * n);
  for (let d = 0; d < n; d++) {
    for (const i of [target + d, target - d]) {
      const idx = ((i % n) + n) % n;
      if (!taken.has(idx) && isStraightAt(cells, idx)) return idx;
    }
  }
  throw new Error("no free straight left on this route");
}

// ── Shapes ──────────────────────────────────────────────────────────
// Every shape is a closed circuit. Sizes are in grid cells; the compiler
// turns the corners into bends and the ramps into levels. Shapes that
// cross their own path rely on a ramp lifting one pass over the other.

/**
 * Raise a stretch of the lap: ramps up at `from`, back down at `to`,
 * both given as a fraction of the way round. `steps` is how many levels.
 */
function rise(shape: Shape, from: number, to: number, steps = 1, extra: Feature[] = []): Shape {
  const features = [...shape.features];
  for (let i = 0; i < steps; i++) {
    features.push({ type: "rampUp", frac: from + i * 0.035 });
  }
  for (let i = 0; i < steps; i++) {
    features.push({ type: "rampDown", frac: to + i * 0.035 });
  }
  return { cells: shape.cells, features: [...features, ...extra] };
}

/** Add ramp pieces to a shape, in the order the route meets them. */
function hill(shape: Shape, ups: Pt[], downs: Pt[], extra: Feature[] = []): Shape {
  return {
    cells: shape.cells,
    features: [
      ...shape.features,
      ...ups.map((cell): Feature => ({ type: "rampUp", cell })),
      ...downs.map((cell): Feature => ({ type: "rampDown", cell })),
      ...extra,
    ],
  };
}

/** Plain rectangle — the shape you learn the car on. */
function oval(w: number, h: number): Shape {
  return { cells: route([[1, 1], [w, 1], [w, h], [1, h], [1, 1]]), features: [] };
}

/** Rectangle with an S-jog cut into the top straight. */
function chicane(w: number, h: number, at = 3, depth = 2): Shape {
  return {
    cells: route([
      [1, 1], [at, 1], [at, 1 + depth], [at + 3, 1 + depth], [at + 3, 1],
      [w, 1], [w, h], [1, h], [1, 1],
    ]),
    features: [],
  };
}

/** Serpentine: `rows` parallel straights joined by hairpins. */
function switchback(w: number, rows: number, gap = 2): Shape {
  const pts: Pt[] = [[2, 2], [w, 2]];
  let x = w;
  for (let r = 1; r < rows; r++) {
    const z = 2 + r * gap;
    pts.push([x, z]);
    const nx = r % 2 === 1 ? 3 : w;
    pts.push([nx, z]);
    x = nx;
  }
  const zBot = 2 + rows * gap;
  pts.push([x, zBot], [2, zBot], [2, 2]);
  return { cells: route(pts), features: [] };
}

/** Outer loop with a spur folded into the infield. */
function spur(w: number, h: number, inset = 6): Shape {
  const a = Math.round(h * 0.4), b = Math.round(h * 0.7);
  return {
    cells: route([
      [2, 1], [w, 1], [w, a], [inset, a], [inset, b], [w, b], [w, h], [2, h], [2, 1],
    ]),
    features: [],
  };
}

/** Big circuit with a notch bitten out of one side. */
function grandTour(w: number, h: number, notch = 5): Shape {
  const mid = Math.round(h / 2);
  return {
    cells: route([
      [1, 1], [w, 1], [w, mid - 2], [w - notch, mid - 2], [w - notch, mid + 2],
      [w, mid + 2], [w, h], [1, h], [1, 1],
    ]),
    features: [],
  };
}

/**
 * Skeleton for the crossing shapes: the return straight runs back across
 * the outbound leg, so whichever pass is raised becomes a flyover.
 * Returns the cells plus the landmarks the ramps need.
 */
function crossingSkeleton(w: number, h: number) {
  const a = Math.max(6, Math.round(w * 0.62));  // the column that gets crossed
  const c = a - 4;                              // where the return straight starts
  const d = Math.max(4, Math.round(h * 0.45));  // the row it runs along
  const b = d + 3;                              // how far the crossed column reaches
  if (c < 3 || a >= w - 2 || b >= h) throw new Error(`crossing ${w}x${h} doesn't fit`);
  return {
    cells: route([[2, 2], [a, 2], [a, b], [c, b], [c, d], [w, d], [w, h], [2, h], [2, 2]]),
    a, c, d, w,
  };
}

/** Figure-eight: the return straight flies a level over the outbound leg. */
function crossover(w: number, h: number): Shape {
  const s = crossingSkeleton(w, h);
  return hill(
    { cells: s.cells, features: [] },
    [[s.c + 1, s.d]],
    [[s.w - 1, s.d]],
    [{ type: "boost", cell: [s.a - 1, s.d] }],
  );
}

/** The same crossing, taken two levels up — a proper flyover. */
function spiral(w: number, h: number): Shape {
  const s = crossingSkeleton(w, h);
  return hill(
    { cells: s.cells, features: [] },
    [[s.c + 1, s.d], [s.c + 2, s.d]],
    [[s.w - 2, s.d], [s.w - 1, s.d]],
    [{ type: "boost", cell: [s.a + 1, s.d] }],
  );
}

/**
 * Two flyovers: the road doubles back twice across the same outer leg,
 * staying up on stilts for the whole middle section.
 */
function doubleCross(w: number, h: number): Shape {
  const far = w + 2;
  const lower = Math.max(6, Math.round(h * 0.55));
  const upper = lower - 4;
  if (upper < 3) throw new Error(`double crossing ${w}x${h} doesn't fit`);
  const cells = route([
    [2, 2], [w, 2], [w, h], [2, h], [2, lower], [far, lower],
    [far, upper], [2, upper], [2, 2],
  ]);
  return hill(
    { cells, features: [] },
    [[4, lower]],
    [[6, upper]],
    [{ type: "boost", cell: [w - 2, lower] }],
  );
}

/** A long elevated straight on stilts, left over a jump. */
function skyway(w: number, h: number): Shape {
  return hill(
    { cells: route([[2, 2], [w, 2], [w, h], [2, h], [2, 2]]), features: [] },
    [[4, 2], [5, 2]],
    [[w - 3, 2], [w - 2, 2]],
    [
      { type: "boost", cell: [8, 2] },
      { type: "jump", cell: [Math.round(w / 2), h] },
    ],
  );
}

/** Climbs a level on each of two sides, then steps back down. */
function terrace(w: number, h: number): Shape {
  const mid = Math.round(h / 2);
  return hill(
    { cells: route([[1, 1], [w, 1], [w, h], [1, h], [1, 1]]), features: [] },
    [[3, 1], [w - 2, 1]],
    [[w, mid], [Math.round(w / 2), h]],
    [{ type: "boost", cell: [5, 1] }],
  );
}

/** One hill over the top straight and back down the far side. */
function hillLoop(w: number, h: number): Shape {
  return hill(
    { cells: route([[1, 1], [w, 1], [w, h], [1, h], [1, 1]]), features: [] },
    [[3, 1]],
    [[w, Math.round(h / 2)]],
  );
}

/** Tight infield hairpins — the same serpentine, packed closer. */
function hairpins(w: number, rows: number): Shape {
  return switchback(w, rows, 2);
}

// ── The catalogue ───────────────────────────────────────────────────

/**
 * Author-medal target: straights are taken near top speed, corners cost
 * time, and climbing costs more than running flat.
 */
function targetTime(data: TrackData): number {
  let seconds = 0;
  for (const t of data.tiles) {
    if (t.type === "curveL" || t.type === "curveR") seconds += TILE / 13;
    else seconds += TILE / 30;
    if (t.type === "rampUp") seconds += 0.45;
    if (t.type === "rampDown") seconds += 0.1;
    if (t.type === "jump") seconds += 0.5;
    if (t.type === "boost") seconds -= 0.2;
  }
  return Math.round((seconds + 1.2) * 1000);
}

/** Spread checkpoints evenly round the lap; compile() finds them room. */
function withCheckpoints(shape: Shape, count: number): Shape {
  const features = [...shape.features];
  for (let i = 1; i <= count; i++) {
    features.push({ type: "checkpoint", frac: i / (count + 1) });
  }
  return { cells: shape.cells, features };
}

function build(
  id: number, name: string, season: Season, difficulty: Difficulty,
  shape: Shape, checkpoints: number,
): BuiltinLevel {
  let data: TrackData;
  try {
    data = compile(withCheckpoints(shape, checkpoints));
  } catch (e) {
    throw new Error(`built-in "${name}" failed to compile: ${(e as Error).message}`);
  }
  const invalid = validateTrack(data);
  if (invalid) throw new Error(`built-in "${name}" is invalid: ${invalid}`);
  const walk = walkTrack(data);
  if (!walk.reachesFinish) {
    throw new Error(`built-in "${name}" is not drivable: ${walk.problem ?? "unknown"}`);
  }
  return { id, name, season, difficulty, goal: targetTime(data), data };
}

type Entry = [name: string, difficulty: Difficulty, shape: Shape, checkpoints: number];

/**
 * Ten tracks per season. Each season runs its own set of layouts — no two
 * of the forty share a shape — and works up from plain ovals through
 * hills to full flyovers.
 */
const CATALOGUE: Record<Season, Entry[]> = {
  spring: [
    ["Sprout Loop",       "easy",   oval(7, 5), 2],
    ["Meadow Mile",       "easy",   oval(12, 6), 3],
    ["Willow Bend",       "easy",   rise(chicane(11, 7, 3, 2), 0.55, 0.8), 3],
    ["Fern Switchback",   "medium", rise(switchback(9, 3), 0.1, 0.45), 3],
    ["Bluebell Rise",     "medium", hillLoop(11, 7), 3],
    ["Clover Spur",       "medium", rise(spur(11, 10, 6), 0.2, 0.62, 2), 3],
    ["Dewfall Crossing",  "medium", crossover(13, 10), 3],
    ["Highvine Terrace",  "hard",   terrace(12, 8), 4],
    ["Verdant Circuit",   "hard",   rise(grandTour(15, 12, 5), 0.08, 0.55, 2), 4],
    ["Skyblossom",        "hard",   skyway(13, 9), 4],
  ],
  summer: [
    ["Sunbaked Oval",     "easy",   oval(9, 7), 2],
    ["Dune Dash",         "easy",   rise(oval(14, 5), 0.1, 0.35), 3],
    ["Mirage Kink",       "easy",   chicane(13, 6, 4, 3), 3],
    ["Canyon Switch",     "medium", rise(switchback(11, 3, 3), 0.12, 0.5, 2), 3],
    ["Sandstone Rise",    "medium", hillLoop(13, 6), 3],
    ["Oasis Spur",        "medium", rise(spur(12, 12, 7), 0.25, 0.7), 4],
    ["Scorpion Cross",    "medium", crossover(15, 11), 4],
    ["Sunspire Climb",    "hard",   terrace(14, 10), 4],
    ["Great Basin",       "hard",   rise(grandTour(17, 13, 6), 0.06, 0.5, 2), 5],
    ["Coilback Pass",     "hard",   rise(hairpins(12, 4), 0.15, 0.72, 2), 4],
  ],
  fall: [
    ["Amber Loop",        "easy",   oval(10, 8), 2],
    ["Harvest Mile",      "easy",   rise(oval(15, 6), 0.08, 0.4), 3],
    ["Copper Kink",       "easy",   chicane(14, 8, 5, 3), 3],
    ["Ember Switchback",  "medium", rise(switchback(13, 4), 0.1, 0.55, 2), 4],
    ["Maple Rise",        "medium", rise(hillLoop(15, 8), 0.5, 0.78), 4],
    ["Orchard Spur",      "medium", rise(spur(14, 11, 8), 0.22, 0.66, 2), 4],
    ["Hollow Crossing",   "medium", crossover(16, 12), 4],
    ["Ridgefire Climb",   "hard",   rise(terrace(16, 11), 0.55, 0.82), 5],
    ["Amber Grand Tour",  "hard",   rise(grandTour(19, 14, 7), 0.06, 0.46, 2), 5],
    ["Twinfall Viaduct",  "hard",   doubleCross(16, 13), 5],
  ],
  winter: [
    ["Frost Oval",        "easy",   oval(11, 9), 2],
    ["Glacier Mile",      "easy",   rise(oval(16, 7), 0.07, 0.38), 3],
    ["Icicle Kink",       "easy",   rise(chicane(16, 9, 6, 4), 0.6, 0.85), 3],
    ["Drift Switchback",  "medium", rise(switchback(15, 5), 0.08, 0.6, 2), 4],
    ["Summit Rise",       "medium", rise(hillLoop(17, 9), 0.48, 0.76, 2), 4],
    ["Pinehall Spur",     "medium", rise(spur(16, 13, 9), 0.2, 0.68, 2), 4],
    ["Blizzard Crossing", "medium", crossover(18, 13), 4],
    ["Northwall Climb",   "hard",   skyway(17, 11), 5],
    ["Frost Grand Tour",  "hard",   rise(grandTour(21, 16, 8), 0.05, 0.44, 3), 6],
    ["Aurora Spiral",     "hard",   spiral(19, 14), 5],
  ],
};

const SEASON_ORDER: Season[] = ["spring", "summer", "fall", "winter"];

export const BUILTINS: BuiltinLevel[] = SEASON_ORDER.flatMap((season, si) =>
  CATALOGUE[season].map(([name, difficulty, shape, cps], i) =>
    build(si * 10 + i + 1, name, season, difficulty, shape, cps),
  ),
);

export const BUILTINS_BY_SEASON: Record<Season, BuiltinLevel[]> = {
  spring: BUILTINS.filter((l) => l.season === "spring"),
  summer: BUILTINS.filter((l) => l.season === "summer"),
  fall: BUILTINS.filter((l) => l.season === "fall"),
  winter: BUILTINS.filter((l) => l.season === "winter"),
};

/** Highest level any built-in reaches — used by tests and docs. */
export const MAX_BUILTIN_LEVEL = Math.max(
  ...BUILTINS.map((l) => Math.max(...l.data.tiles.map((t) => t.y))),
);

void LEVEL_H;
