// Shared Poly Racer engine: theme, physics, renderer.
// Used by the built-in levels, editor preview, and custom-track player.
import type { TrackParams } from "./track-validation";

export const W = 480;
export const H = 640;

export type Season = "spring" | "summer" | "fall" | "winter";

export type Theme = {
  ground: string;
  road: string;
  roadEdge: string;
  dash: string;
  label: string;
  emoji: string;
  fleck: string;
};

export const THEMES: Record<Season, Theme> = {
  spring: { ground: "#1f7a3a", road: "#3a3a44", roadEdge: "#e5e7eb", dash: "#fde047", label: "Spring", emoji: "🌱", fleck: "#4ade80" },
  summer: { ground: "#d9b26a", road: "#a88558", roadEdge: "#f4e2b8", dash: "#ffffff", label: "Summer", emoji: "🏜️", fleck: "#f5deb3" },
  fall:   { ground: "#7a3e1d", road: "#3a3a44", roadEdge: "#e5e7eb", dash: "#fde047", label: "Fall",   emoji: "🍂", fleck: "#f97316" },
  winter: { ground: "#e8eef5", road: "#c9d3de", roadEdge: "#94a3b8", dash: "#64748b", label: "Winter", emoji: "❄️", fleck: "#ffffff" },
};

export function centerAt(y: number, p: TrackParams) {
  return W / 2
    + Math.sin(y * p.freq1 + p.phase) * p.amp1
    + Math.sin(y * p.freq2 + p.phase * 1.7) * p.amp2;
}

// Static preview (no scroll, no car). Used by the editor to show the road shape.
export function drawPreview(
  ctx: CanvasRenderingContext2D,
  p: TrackParams,
  season: Season,
  goal: number,
) {
  const theme = THEMES[season];
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = theme.road;
  ctx.beginPath();
  for (let y = 0; y <= H; y += 6) {
    const c = centerAt(y, p);
    if (y === 0) ctx.moveTo(c - p.half, y);
    else ctx.lineTo(c - p.half, y);
  }
  for (let y = H; y >= 0; y -= 6) {
    const c = centerAt(y, p);
    ctx.lineTo(c + p.half, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = theme.roadEdge;
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let y = 0; y <= H; y += 6) {
      const c = centerAt(y, p) + side * p.half;
      if (y === 0) ctx.moveTo(c, y);
      else ctx.lineTo(c, y);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = theme.dash;
  ctx.setLineDash([12, 14]);
  ctx.beginPath();
  for (let y = 0; y <= H; y += 6) {
    const c = centerAt(y, p);
    if (y === 0) ctx.moveTo(c, y);
    else ctx.lineTo(c, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // "START" marker at the bottom.
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(8, H - 26, 60, 18);
  ctx.fillStyle = "#fff";
  ctx.font = "11px sans-serif";
  ctx.fillText("START", 16, H - 12);

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(W - 96, 8, 88, 18);
  ctx.fillStyle = "#fff";
  ctx.fillText(`goal ${goal}`, W - 88, 22);
}

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}`}.${String(cs).padStart(2, "0")}`;
}
