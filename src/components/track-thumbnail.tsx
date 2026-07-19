// Small canvas preview of a DAP Track tile layout (top-down 2D).
import { useEffect, useRef } from "react";
import { drawTrackThumbnail, type Season } from "@/lib/polytrack-engine";
import { isTrackData, type TrackData } from "@/lib/track-validation";

export function TrackThumbnail({
  data,
  season,
  className,
  width = 160,
  height,
}: {
  data: unknown;
  season: Season;
  className?: string;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const h = height ?? Math.round((width * 3) / 4);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const track: TrackData | null = isTrackData(data) ? (data as TrackData) : null;
    drawTrackThumbnail(ctx, track, season, width, h);
  }, [data, season, width, h]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width, height: h, display: "block" }}
      aria-hidden="true"
    />
  );
}
