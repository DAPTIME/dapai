// DAP Track built-in tracks.
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
//
// Two rules keep a shape drivable rather than merely valid. Quick
// left-rights — a chamfered corner, a staircase tread, the mouth of a
// notch — want at least three cells of road between the two bends, or a
// car carrying speed simply runs out of tarmac. And ramps belong in the
// middle of long straights: a bend taken on a raised deck has nothing
// beyond its edge, so a boost pad just before one is a way off the map.

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

/**
 * Rectangle with every corner cut back by `cut` cells, which the grid
 * renders as a step. A small cut rounds a rectangle off into something
 * that flows; a cut approaching half the shorter side pulls the straights
 * inward until the silhouette is a cross.
 */
function polygonRing(w: number, h: number, cut: number): Shape {
  if (w < 2 * cut + 4 || h < 2 * cut + 4) throw new Error(`ring ${w}x${h} cut ${cut} doesn't fit`);
  const a = 1 + cut, bx = w - cut, bz = h - cut;
  return {
    cells: route([
      [a, 1], [bx, 1], [bx, a], [w, a],
      [w, bz], [bx, bz], [bx, h],
      [a, h], [a, bz], [1, bz],
      [1, a], [a, a], [a, 1],
    ]),
    features: [],
  };
}

/**
 * Waisted ring: a notch bitten out of the middle of both long sides, so
 * the lap pinches in the centre and opens into a lobe at each end.
 * `raised` puts the whole right-hand lobe up on stilts — the ramps go on
 * the long straights either side of it, never in the notch, because a
 * bend taken on a raised deck is a bend you fall off.
 */
function dogbone(w: number, h: number, neck: number, depth: number, raised = false): Shape {
  const m = Math.round((w + 1) / 2);
  if (m - neck < 3 || m + neck > w - 3) throw new Error(`dogbone ${w} is too narrow for neck ${neck}`);
  if (h < 2 * depth + 3) throw new Error(`dogbone ${h} is too short for depth ${depth}`);
  const shape: Shape = {
    cells: route([
      [1, 1], [m - neck, 1], [m - neck, 1 + depth], [m + neck, 1 + depth], [m + neck, 1], [w, 1],
      [w, h], [m + neck, h], [m + neck, h - depth], [m - neck, h - depth], [m - neck, h], [1, h],
      [1, 1],
    ]),
    features: [],
  };
  if (!raised) return shape;
  // The climb starts well down the long right-hand straight and comes
  // back to earth on the bottom row, so no bend is taken on a ledge.
  return hill(shape, [[w, 3]], [[m + neck + 3, h]], [
    { type: "boost", cell: [m + neck + 1, h] },
  ]);
}

/**
 * A staircase down one long side, then one sweeping return leg. `levels`
 * lifts that return leg into a viaduct; the staircase itself stays on the
 * deck, where its quick left-rights belong.
 */
function zigzag(w: number, h: number, steps: number, depth: number, levels = 0): Shape {
  const run = Math.max(4, Math.floor((w - 2) / (steps + 1)));
  if (1 + steps * run >= w) throw new Error(`zigzag ${w} can't fit ${steps} steps of ${run}`);
  if (1 + steps * depth >= h - 1) throw new Error(`zigzag ${w}x${h} can't fit ${steps} steps`);
  const pts: Pt[] = [[1, 1]];
  let z = 1;
  for (let i = 1; i <= steps; i++) {
    pts.push([1 + i * run, z]);
    z += depth;
    pts.push([1 + i * run, z]);
  }
  pts.push([w, z], [w, h], [1, h], [1, 1]);
  const shape: Shape = { cells: route(pts), features: [] };
  if (levels < 1) return shape;
  const ups: Pt[] = [], downs: Pt[] = [];
  for (let i = 0; i < levels; i++) {
    ups.push([w - 2 - i, h]);
    downs.push([3 + levels - i, h]);
  }
  if (3 + levels >= w - 2 - levels) throw new Error(`zigzag ${w} has no room for a viaduct`);
  return hill(shape, ups, downs, [{ type: "boost", cell: [Math.round(w * 0.68), h] }]);
}

/** L-shaped circuit — a whole quarter of the field is left out. */
function lCircuit(w: number, h: number, bx: number, bz: number): Shape {
  if (bx <= 2 || bx >= w || bz <= 2 || bz >= h) throw new Error(`L ${w}x${h} bite ${bx},${bz} doesn't fit`);
  return { cells: route([[1, 1], [w, 1], [w, bz], [bx, bz], [bx, h], [1, h], [1, 1]]), features: [] };
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

/** Spurs folded into the infield from both sides, one after the other. */
function twinSpur(w: number, h: number, inset: number): Shape {
  const step = Math.max(3, Math.floor((h - 3) / 4));
  const a = 1 + step, b = a + step, c = b + step, d = c + step;
  if (d > h - 2) throw new Error(`twin spur ${w}x${h} doesn't fit`);
  const out = Math.max(4, w - inset + 2);
  if (inset <= 3 || inset >= w - 1 || out >= w - 1) throw new Error(`twin spur inset ${inset} doesn't fit`);
  return {
    cells: route([
      [2, 1], [w, 1], [w, a], [inset, a], [inset, b], [w, b], [w, h],
      [2, h], [2, d], [out, d], [out, c], [2, c], [2, 1],
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
    [
      { type: "boost", cell: [Math.round(far * 0.45), lower] },
      { type: "jump", cell: [Math.round(w / 2), h] },
    ],
  );
}

/**
 * Cloverleaf: the lap winds twice round, ducking into the infield and
 * then flying back out over the straight it came in on.
 */
function cloverleaf(w: number, h: number): Shape {
  const p = Math.max(4, Math.round(h * 0.35));
  const r = Math.min(h - 2, p + 4);
  const g = Math.max(6, Math.round(w * 0.6));
  if (r <= p + 1 || g >= w - 2 || p <= 3) throw new Error(`cloverleaf ${w}x${h} doesn't fit`);
  const cells = route([
    [2, 2], [w, 2], [w, h], [2, h], [2, p], [g, p], [g, r], [0, r], [0, 2], [2, 2],
  ]);
  return hill(
    { cells, features: [] },
    [[g - 1, p]],
    [[1, r]],
    [
      { type: "boost", cell: [w - 2, h] },
      { type: "jump", cell: [Math.round(w / 2), 2] },
    ],
  );
}

/**
 * Weave: the road leaves the ring at the bottom, climbs over the main
 * straight, doubles back above the field and drops down over it again —
 * two flyovers on the same piece of tarmac.
 */
function weave(w: number, h: number): Shape {
  const c = Math.max(7, Math.round(w * 0.62));
  const d = c - 4;
  if (c > w - 3 || d < 4 || h < 8) throw new Error(`weave ${w}x${h} doesn't fit`);
  const cells = route([
    [2, 2], [w, 2], [w, h], [c, h], [c, 0], [d, 0], [d, h], [2, h], [2, 2],
  ]);
  return hill(
    { cells, features: [] },
    [[c + 2, h]],
    [[d, 5]],
    [{ type: "boost", cell: [w, 4] }],
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


/**
 * A perimeter loop with rectangular bites taken out of its sides.
 *
 * This exists because size alone does not make two tracks look different.
 * Forty tracks built from ovals and rings traced only eleven distinct
 * paths between them: a 13x9 rectangle and an 18x12 rectangle are the same
 * track drawn at two scales, and the eye reads the turn sequence, not the
 * dimensions. Each bite adds four corners, so the *number and placement*
 * of bites is what actually makes one loop read differently from another.
 *
 * `bites` is [top, right, bottom, left]. Depth is how far each one cuts in.
 */
function notchedLoop(
  w: number,
  h: number,
  bites: [number, number, number, number],
  depth = 2,
): Shape {
  const x0 = 1, z0 = 1, x1 = w, z1 = h;
  const pts: Pt[] = [];

  /** Walk one side, cutting `n` evenly spaced bites into it. */
  const side = (
    ax: number, az: number, bx: number, bz: number,
    n: number, inx: number, inz: number,
  ) => {
    pts.push([ax, az]);
    if (n <= 0) return;
    const horiz = az === bz;
    const span = horiz ? bx - ax : bz - az;
    const dir = Math.sign(span);
    const len = Math.abs(span);
    // Each bite needs room for two walls and a floor, plus a gap either
    // side, or the loop doubles back onto itself.
    const cell = Math.floor(len / (n + 1));
    // Bailing quietly here was a trap: the side still got traced, so the
    // bites simply vanished and the "varied" loop came out a plain
    // rectangle that the catalogue then believed was distinct.
    if (cell < 3) {
      throw new Error(`notchedLoop: ${n} bite(s) need a side of at least ${3 * (n + 1)}, got ${len}`);
    }
    const width = Math.max(2, Math.floor(cell / 2));
    for (let i = 0; i < n; i++) {
      const at = (i + 1) * cell;
      const s = at - Math.floor(width / 2);
      const e = s + width;
      if (horiz) {
        const sx = ax + dir * s, ex = ax + dir * e;
        pts.push([sx, az], [sx, az + inz * depth], [ex, az + inz * depth], [ex, az]);
      } else {
        const sz = az + dir * s, ez = az + dir * e;
        pts.push([ax, sz], [ax + inx * depth, sz], [ax + inx * depth, ez], [ax, ez]);
      }
    }
  };

  side(x0, z0, x1, z0, bites[0], 0, 1);    // top, bites cut downward
  side(x1, z0, x1, z1, bites[1], -1, 0);   // right, cut leftward
  side(x1, z1, x0, z1, bites[2], 0, -1);   // bottom, cut upward
  side(x0, z1, x0, z0, bites[3], 1, 0);    // left, cut rightward
  pts.push([x0, z0]);

  return { cells: route(pts), features: [] };
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


/**
 * Author-medal targets measured from the leaderboard, in ms.
 *
 * targetTime() below estimates a lap from the geometry, and the estimate
 * turned out to be generous everywhere: across the twenty built-ins that
 * have a recorded time, the fastest lap beat the estimate on all twenty,
 * by 6% to 56%. An "author" medal handed out for a lap four seconds slower
 * than the track record is not an author medal.
 *
 * So where a real time exists, the target is that record plus one second.
 * Beating it means matching the best anyone has driven, near enough.
 *
 * Measured 2026-08-17 from get_track_leaderboard. These are a snapshot, not
 * a live read: a target that moved every time somebody set a record would
 * take medals away from players who had already earned them, which is worse
 * than being slightly out of date. Re-run the numbers deliberately.
 */
const MEASURED_GOALS: Record<number, number> = {
  1: 9383,      // Sprout Loop
  2: 17158,     // Meadow Kink
  3: 21483,     // Clover Ring
  4: 21517,     // Willow Waist
  5: 21050,     // Fern Switchback
  6: 15392,     // Bluebell Rise
  7: 22042,     // Verdant Spur
  8: 21600,     // Dewfall Crossing
  9: 16333,     // Highvine Terrace
  10: 16083,    // Skyblossom
  11: 21900,    // Sunbaked Ring
  12: 21633,    // Dune Dash
  13: 21800,    // Mirage Kink
  14: 23083,    // Canyon Switch
  15: 15858,    // Sandstone Rise
  16: 30342,    // Oasis Spur
  17: 24425,    // Scorpion Cross
  18: 23900,    // Sunspire Climb
  19: 21525,    // Great Basin
  31: 32625,    // Frost Ring
};

/**
 * Applied to the estimate for the twenty tracks nobody has set a time on.
 *
 * The median measured target came out at 0.771 of the estimate, so the
 * estimator is generous by a consistent enough margin to correct for.
 * The median rather than the tightest ratio (0.437), because guessing a
 * target nobody has ever driven should err toward attainable.
 */
const UNMEASURED_TIGHTEN = 0.771;

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
  const goal =
    MEASURED_GOALS[id] ?? Math.round(targetTime(data) * UNMEASURED_TIGHTEN);
  return { id, name, season, difficulty, goal, data };
}

type Entry = [name: string, difficulty: Difficulty, shape: Shape, checkpoints: number];

/**
 * Ten tracks per season, and no two of the forty are the same layout.
 * A season opens on a shape you can read at a glance — a ring, a kink, a
 * waist — then works through hills, switchbacks and infield spurs into
 * the crossings and climbs at the bottom of the list. The fields widen as
 * the year turns, so winter's laps are the longest.
 */
const CATALOGUE: Record<Season, Entry[]> = {
  spring: [
    ["Sprout Loop",       "easy",   oval(9, 7), 2],
    ["Meadow Kink",       "easy",   notchedLoop(14, 9, [0, 0, 0, 1]), 2],
    ["Clover Ring",       "easy",   notchedLoop(15, 11, [0, 1, 0, 1]), 2],
    ["Willow Waist",      "easy",   notchedLoop(14, 10, [0, 0, 1, 1], 3), 3],
    ["Fern Switchback",   "medium", rise(notchedLoop(13, 14, [0, 0, 0, 3]), 0.12, 0.5), 3],
    ["Bluebell Rise",     "medium", rise(notchedLoop(15, 10, [0, 0, 0, 2]), 0.18, 0.6), 3],
    ["Verdant Spur",      "medium", rise(notchedLoop(15, 12, [0, 1, 2, 1]), 0.2, 0.62, 2), 3],
    ["Dewfall Crossing",  "medium", notchedLoop(14, 10, [0, 1, 3, 1]), 3],
    ["Highvine Terrace",  "hard",   rise(notchedLoop(15, 11, [0, 0, 1, 2]), 0.5, 0.8), 4],
    ["Skyblossom",        "hard",   rise(notchedLoop(15, 13, [1, 1, 1, 2]), 0.15, 0.62, 2), 4],
  ],
  summer: [
    ["Sunbaked Ring",     "easy",   polygonRing(17, 13, 4), 2],
    ["Dune Dash",         "easy",   zigzag(16, 12, 3, 3, 1), 3],
    ["Mirage Kink",       "easy",   notchedLoop(16, 10, [0, 0, 2, 1], 3), 3],
    ["Canyon Switch",     "medium", rise(switchback(12, 4, 3), 0.12, 0.5, 2), 3],
    ["Sandstone Rise",    "medium", rise(notchedLoop(16, 11, [0, 1, 0, 2]), 0.3, 0.7), 3],
    ["Oasis Spur",        "medium", rise(notchedLoop(14, 15, [0, 2, 1, 2]), 0.25, 0.7), 4],
    ["Scorpion Cross",    "medium", notchedLoop(15, 11, [0, 2, 3, 0]), 4],
    ["Sunspire Climb",    "hard",   rise(notchedLoop(17, 12, [0, 1, 1, 1]), 0.55, 0.85), 4],
    ["Great Basin",       "hard",   rise(lCircuit(18, 13, 9, 7), 0.06, 0.5, 2), 5],
    ["Coilback Pass",     "hard",   rise(notchedLoop(13, 12, [1, 1, 3, 0]), 0.15, 0.72, 2), 4],
  ],
  fall: [
    ["Amber Cross",       "easy",   notchedLoop(16, 13, [0, 0, 2, 3]), 2],
    ["Harvest Mile",      "easy",   notchedLoop(17, 12, [0, 1, 3, 0]), 3],
    ["Copper Kink",       "easy",   zigzag(18, 15, 4, 3), 3],
    ["Ember Switchback",  "medium", rise(switchback(14, 5, 3), 0.1, 0.55, 2), 4],
    ["Maple Rise",        "medium", rise(notchedLoop(17, 14, [0, 0, 1, 3]), 0.5, 0.78), 4],
    ["Orchard Spur",      "medium", rise(notchedLoop(16, 14, [0, 1, 0, 3]), 0.22, 0.66, 2), 4],
    ["Hollow Crossing",   "medium", doubleCross(17, 13), 4],
    ["Ridgefire Climb",   "hard",   rise(notchedLoop(18, 12, [0, 1, 1, 2]), 0.55, 0.82), 5],
    ["Amber Grand Tour",  "hard",   rise(notchedLoop(20, 14, [0, 2, 2, 1]), 0.06, 0.46, 2), 5],
    ["Twinfall Viaduct",  "hard",   rise(notchedLoop(18, 13, [1, 1, 1, 1]), 0.1, 0.5, 2), 5],
  ],
  winter: [
    ["Frost Ring",        "easy",   notchedLoop(19, 12, [0, 0, 2, 2]), 2],
    ["Glacier Mile",      "easy",   rise(notchedLoop(18, 11, [0, 2, 0, 2]), 0.07, 0.38), 3],
    ["Icicle Kink",       "easy",   rise(notchedLoop(18, 11, [0, 0, 3, 1], 3), 0.6, 0.85), 3],
    ["Drift Switchback",  "medium", rise(switchback(16, 6, 3), 0.08, 0.6, 2), 4],
    ["Summit Rise",       "medium", zigzag(22, 18, 4, 3, 2), 4],
    ["Pinehall Spur",     "medium", rise(notchedLoop(19, 13, [0, 2, 1, 1]), 0.2, 0.68, 2), 4],
    ["Blizzard Weave",    "medium", notchedLoop(19, 14, [0, 1, 2, 2]), 4],
    ["Northwall Climb",   "hard",   rise(notchedLoop(20, 15, [0, 2, 0, 3]), 0.5, 0.85), 5],
    ["Frost Grand Tour",  "hard",   rise(notchedLoop(21, 15, [0, 3, 1, 1]), 0.05, 0.44, 3), 6],
    ["Aurora Spiral",     "hard",   spiral(19, 15), 5],
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
