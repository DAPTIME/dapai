// DAP Track built-in demo tracks (tile-based v2 format).
import type { TrackData } from "./track-validation";
import type { Season } from "./polytrack-engine";

export type BuiltinLevel = {
  id: number;
  name: string;
  season: Season;
  goal: number;      // target time (ms) for a "gold" run
  data: TrackData;
};

// Helper: a rectangular loop with an inner ramp. Tiles are placed on
// integer (x,z) grid coords. rot: 0=north,1=east,2=south,3=west.
function loop(w: number, h: number): TrackData {
  const tiles: TrackData["tiles"] = [];
  // bottom row going east (rot 1 = pointing east)
  for (let i = 1; i < w - 1; i++) tiles.push({ type: "straight", x: i, z: h - 1, rot: 1 });
  // right side going north
  for (let j = 1; j < h - 1; j++) tiles.push({ type: "straight", x: w - 1, z: j, rot: 0 });
  // top going west
  for (let i = 1; i < w - 1; i++) tiles.push({ type: "straight", x: i, z: 0, rot: 1 });
  // left side going south
  for (let j = 1; j < h - 1; j++) tiles.push({ type: "straight", x: 0, z: j, rot: 0 });
  // corners
  tiles.push({ type: "curveL", x: w - 1, z: h - 1, rot: 0 });
  tiles.push({ type: "curveL", x: w - 1, z: 0,     rot: 3 });
  tiles.push({ type: "curveL", x: 0,     z: 0,     rot: 2 });
  tiles.push({ type: "curveL", x: 0,     z: h - 1, rot: 1 });
  return { version: 2, tiles };
}

function withStart(base: TrackData, sx: number, sz: number, srot: 0|1|2|3, fx: number, fz: number, frot: 0|1|2|3, checkpoints: Array<{x:number;z:number;rot:0|1|2|3}> = []): TrackData {
  const tiles = base.tiles.filter((t) => !((t.x === sx && t.z === sz) || (t.x === fx && t.z === fz)));
  tiles.push({ type: "start", x: sx, z: sz, rot: srot });
  tiles.push({ type: "finish", x: fx, z: fz, rot: frot });
  for (const c of checkpoints) tiles.push({ type: "checkpoint", x: c.x, z: c.z, rot: c.rot });
  return { version: 2, tiles };
}

// Track 1: gentle 6x5 loop
const T1 = withStart(loop(6, 5), 3, 4, 1, 2, 4, 1, [
  { x: 5, z: 2, rot: 0 }, { x: 3, z: 0, rot: 1 }, { x: 0, z: 2, rot: 0 },
]);

// Track 2: 8x6 loop with a ramp on the top row
const _t2 = loop(8, 6);
_t2.tiles = _t2.tiles.map((t) => (t.x === 4 && t.z === 0 ? { ...t, type: "rampUp", elev: 0 } : t));
_t2.tiles.push({ type: "rampDown", x: 5, z: 0, rot: 1, elev: 1 });
// tighten inner spot to fit ramp — replace next tile as straight at elev 1
_t2.tiles = _t2.tiles.map((t) => (t.x === 5 && t.z === 0 && t.type !== "rampDown" ? { ...t, elev: 1 } : t));
const T2 = withStart(_t2, 4, 5, 1, 3, 5, 1, [
  { x: 7, z: 3, rot: 0 }, { x: 3, z: 0, rot: 1 }, { x: 0, z: 3, rot: 0 },
]);

// Track 3: figure-8-ish — two joined boxes
const T3: TrackData = (() => {
  const t: TrackData["tiles"] = [];
  // outer 8-wide, 4-tall loop
  for (let i = 1; i < 7; i++) { t.push({ type: "straight", x: i, z: 3, rot: 1 }); t.push({ type: "straight", x: i, z: 0, rot: 1 }); }
  for (let j = 1; j < 3; j++) { t.push({ type: "straight", x: 0, z: j, rot: 0 }); t.push({ type: "straight", x: 7, z: j, rot: 0 }); }
  t.push({ type: "curveL", x: 7, z: 3, rot: 0 });
  t.push({ type: "curveL", x: 7, z: 0, rot: 3 });
  t.push({ type: "curveL", x: 0, z: 0, rot: 2 });
  t.push({ type: "curveL", x: 0, z: 3, rot: 1 });
  return withStart({ version: 2, tiles: t }, 4, 3, 1, 3, 3, 1, [
    { x: 7, z: 2, rot: 0 }, { x: 4, z: 0, rot: 1 }, { x: 0, z: 2, rot: 0 },
  ]);
})();

// Track 4: big 10x7 loop, more curves for pacing
const T4 = withStart(loop(10, 7), 5, 6, 1, 4, 6, 1, [
  { x: 9, z: 3, rot: 0 }, { x: 5, z: 0, rot: 1 }, { x: 0, z: 3, rot: 0 },
]);

export const BUILTINS: BuiltinLevel[] = [
  { id: 1, name: "Sprout Loop",     season: "spring", goal: 22000, data: T1 },
  { id: 2, name: "Sunbaked Rise",   season: "summer", goal: 32000, data: T2 },
  { id: 3, name: "Amber Twin",      season: "fall",   goal: 34000, data: T3 },
  { id: 4, name: "Frost Grand Tour",season: "winter", goal: 42000, data: T4 },
];
