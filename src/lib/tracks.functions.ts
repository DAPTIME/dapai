// Server functions for DAP Track custom tracks, scores, and leaderboards.
// Tracks are stored as JSON in `custom_tracks.params` (schema unchanged).
// The JSON shape is TrackData v2 (tile-based). Legacy v1 rows are kept
// readable but cannot be edited or re-published.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateForPublish, validateTrack, toTrackData, MAX_LEVEL, MAX_TILES } from "./track-validation";

// Accepts both the v2 flat grid (which used `elev`) and the v3 levelled
// grid; handlers normalise to v3 before storing.
const tileSchema = z.object({
  type: z.enum([
    "straight", "curveL", "curveR", "rampUp", "rampDown",
    "jump", "boost", "start", "finish", "checkpoint",
  ]),
  x: z.number().int(),
  y: z.number().int().min(0).max(MAX_LEVEL).optional(),
  z: z.number().int(),
  rot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  elev: z.number().int().min(0).max(MAX_LEVEL).optional(),
});
const trackDataSchema = z.object({
  version: z.union([z.literal(2), z.literal(3)]),
  tiles: z.array(tileSchema).min(3).max(MAX_TILES),
});

const seasonSchema = z.enum(["spring", "summer", "fall", "winter"]);

function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined as unknown as Storage },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listMyTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("custom_tracks")
      .select("id, name, season, is_public, goal, play_count, created_at, updated_at, params")
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPublicTracks = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("custom_tracks")
    .select("id, name, season, goal, play_count, created_at, owner_id, params")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  // Silently hide legacy v1 tracks from the public browse list — they
  // cannot be played by the new 3D runner.
  return (data ?? []).filter((r) => toTrackData(r.params) !== null);
});

export const getTrack = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: row, error } = await supabase
      .from("custom_tracks")
      .select("id, name, season, params, goal, is_public, play_count, owner_id, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Track not found");
    return row;
  });

export const getMyTrack = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("custom_tracks")
      .select("id, name, season, params, goal, is_public, play_count, owner_id, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Track not found");
    return row;
  });

export const createTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      name: z.string().min(1).max(60),
      season: seasonSchema,
      params: trackDataSchema,
      goal: z.number().int().min(2000).max(600_000),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const err = validateTrack(data.params);
    if (err) throw new Error(err);
    const params = toTrackData(data.params)!;
    const { data: row, error } = await context.supabase
      .from("custom_tracks")
      .insert({
        owner_id: context.userId,
        name: data.name.trim(),
        season: data.season,
        params,
        goal: data.goal,
        is_public: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(60),
      season: seasonSchema,
      params: trackDataSchema,
      goal: z.number().int().min(2000).max(600_000),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const err = validateTrack(data.params);
    if (err) throw new Error(err);
    const params = toTrackData(data.params)!;
    const { error } = await context.supabase
      .from("custom_tracks")
      .update({
        name: data.name.trim(),
        season: data.season,
        params,
        goal: data.goal,
        is_public: false,
      })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("custom_tracks")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error: fErr } = await context.supabase
      .from("custom_tracks")
      .select("name, params, owner_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!row) throw new Error("Track not found");
    if (row.owner_id !== context.userId) throw new Error("Not your track");
    const err = validateForPublish(row.name, row.params);
    if (err) throw new Error(err);
    const { error } = await context.supabase
      .from("custom_tracks")
      .update({ is_public: true })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unpublishTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("custom_tracks")
      .update({ is_public: false })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      trackRef: z.string().min(3).max(80),
      timeMs: z.number().int().min(500).max(600_000),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("track_scores")
      .select("id, best_time_ms")
      .eq("user_id", context.userId)
      .eq("track_ref", data.trackRef)
      .maybeSingle();
    if (!existing) {
      const { error } = await context.supabase.from("track_scores").insert({
        user_id: context.userId,
        track_ref: data.trackRef,
        best_time_ms: data.timeMs,
      });
      if (error) throw new Error(error.message);
      return { improved: true, bestMs: data.timeMs };
    }
    if (data.timeMs < existing.best_time_ms) {
      const { error } = await context.supabase
        .from("track_scores")
        .update({ best_time_ms: data.timeMs })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { improved: true, bestMs: data.timeMs };
    }
    return { improved: false, bestMs: existing.best_time_ms };
  });

export const getLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({ trackRef: z.string().min(3).max(80), limit: z.number().int().min(1).max(50).optional() }).parse(i)
  )
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: rows, error } = await supabase.rpc("get_track_leaderboard", {
      _track_ref: data.trackRef,
      _limit: data.limit ?? 20,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ name: string; best_time_ms: number; achieved_at: string; rank: number }>;
  });
