// Small canvas preview of a poly-racer track.
import { useEffect, useRef } from "react";
import { drawPreview, W as ENGINE_W, H as ENGINE_H, type Season } from "@/lib/polytrack-engine";
import type { TrackParams } from "@/lib/track-validation";

export function TrackThumbnail({
  params,
  season,
  goal,
  className,
  width = 160,
  height,
}: {
  params: TrackParams;
  season: Season;
  goal: number;
  className?: string;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const h = height ?? Math.round((width * ENGINE_H) / ENGINE_W);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = ENGINE_W;
    canvas.height = ENGINE_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Draw at engine resolution; CSS scales it down cleanly.
    drawPreview(ctx, params, season, goal);
    void dpr;
  }, [params, season, goal]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width, height, display: "block" }}
      aria-hidden="true"
    />
  );
}
