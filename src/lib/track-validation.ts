// DAP Track tile-based track model + validation.
// Shared by editor, runner, thumbnail, and server-side validation.
// Legacy sine-wave tracks (v1) are detected via isLegacyTrack() and
// shown as read-only "legacy" entries so old saves don't crash the UI.

export type TileType =
  | "straight"
  | "curveL"
  | "curveR"
  | "rampUp"
  | "rampDown"
  | "start"
  | "finish"
  | "checkpoint";

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
    const validTypes: TileType[] = ["straight","curveL","curveR","rampUp","rampDown","start","finish","checkpoint"];
    if (!validTypes.includes(t.type)) return `Unknown tile type ${t.type}.`;
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

export function validateForPublish(name: string, data: unknown): string | null {
  return validateName(name) ?? validateTrack(data);
}
