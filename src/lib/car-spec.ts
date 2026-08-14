/**
 * The DAP Track car's appearance, and the plan rules around editing it.
 *
 * Kept apart from the runner so the server, the editor and the renderer
 * agree on one shape, and so nothing here drags three.js into a bundle
 * that only wants to know what colour a car is.
 */
import { TIER_RANK, type Tier } from "@/lib/tier-rank";

export type CarSpec = {
  /** Shell. */
  body: string;
  /** Splitter, diffuser, wing posts. */
  trim: string;
  /** Glasshouse. */
  glass: string;
  /** Wheel hubs. */
  hub: string;
};

/** The stock car, matching the constants the runner used to hardcode. */
export const DEFAULT_CAR: CarSpec = {
  body: "#f3402f",
  trim: "#272e37",
  glass: "#3a4a5c",
  hub: "#c2cad2",
};

/** Lowest plan that may change any of it. */
export const CAR_MIN_TIER: Tier = "pro";

export function canEditCar(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[CAR_MIN_TIER];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Read a stored car, falling back per field rather than wholesale — a row
 * written by an older version, or with one bad colour in it, still yields
 * a usable car instead of throwing the lot away.
 */
export function toCarSpec(value: unknown): CarSpec {
  if (!value || typeof value !== "object") return { ...DEFAULT_CAR };
  const o = value as Record<string, unknown>;
  const pick = (k: keyof CarSpec) => {
    const v = o[k];
    return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : DEFAULT_CAR[k];
  };
  return { body: pick("body"), trim: pick("trim"), glass: pick("glass"), hub: pick("hub") };
}

/** three.js wants 0xRRGGBB numbers, not CSS strings. */
export function hexToInt(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

/** Presets, so the common case is one click rather than four pickers. */
export const CAR_PRESETS: Array<{ name: string; spec: CarSpec }> = [
  { name: "Factory", spec: DEFAULT_CAR },
  { name: "Midnight", spec: { body: "#1b2a4a", trim: "#0d1220", glass: "#2a3b57", hub: "#8f9bb3" } },
  { name: "Citrus", spec: { body: "#ffb020", trim: "#3a2c10", glass: "#4a3a1c", hub: "#f4e3c0" } },
  { name: "Mint", spec: { body: "#3ddc97", trim: "#123a2c", glass: "#1e4d3c", hub: "#d6f5e6" } },
  { name: "Orchid", spec: { body: "#a855f7", trim: "#2b1640", glass: "#3d2357", hub: "#e6d4f7" } },
  { name: "Frost", spec: { body: "#e8eef7", trim: "#39424f", glass: "#5b6b80", hub: "#9aa6b8" } },
];
