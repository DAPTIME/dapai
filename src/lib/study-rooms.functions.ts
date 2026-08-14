/**
 * Study Rooms — a shared chat session a group can join with a code. Messages
 * live in Supabase so everyone sees the same conversation; presence and
 * typing indicators are handled client-side over Supabase Realtime.
 *
 * Inference still runs on the owner's own hardware through the existing
 * model backends — this only orchestrates the shared transcript.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "./db-error";
import { firstName } from "./utils";
import { completeOnce } from "./ai-backend.server";
import { modelInfo, MODEL_IDS, type ModelId } from "./models";
import { TIER_RANK } from "./tier-rank";
import type { Tier } from "./tier-gate";


const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

async function displayName(
  supabase: { from: (t: string) => any },
  userId: string
) {
  const { data } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();
  return firstName(data?.name ?? data?.email, "Guest");
}

export const createStudyRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        model: z.string().trim().max(40).optional(),
      })
      .parse(i ?? {})
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const model = (modelInfo(data.model ?? "")?.id ?? "dap-ai-lite") as ModelId;

    let room: { id: string; code: string } | null = null;
    let lastError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      const { data: row, error } = await supabase
        .from("study_rooms")
        .insert({
          code: newCode(),
          name: data.name || "Study Room",
          host_id: userId,
          model,
        })
        .select("id, code")
        .single();
      if (error) {
        lastError = error as { message?: string };
        continue;
      }
      room = row;
    }
    if (!room) throw dbError(lastError);

    await supabase.from("study_room_members").insert({
      room_id: room.id,
      user_id: userId,
      display_name: await displayName(supabase, userId),
    });
    return room;
  });

export const joinStudyRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ code: z.string().trim().min(4).max(10) }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // RLS hides rooms you haven't joined, so resolve the code through the
    // narrow lookup function instead of a broad table read.
    const { data: rows, error } = await supabase.rpc("find_study_room_by_code", {
      _code: data.code.toUpperCase(),
    });
    if (error) throw dbError(error);
    const room = (rows ?? [])[0] ?? null;
    if (!room) throw new Error("No study room with that code.");
    if (!room.is_open) throw new Error("That study room has been closed.");
    const { error: joinError } = await supabase
      .from("study_room_members")
      .upsert(
        {
          room_id: room.id,
          user_id: userId,
          display_name: await displayName(supabase, userId),
        },
        { onConflict: "room_id,user_id" }
      );
    if (joinError) throw dbError(joinError);
    return { id: room.id, code: room.code, name: room.name };
  });

export const getStudyRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ code: z.string().trim().min(4).max(10) }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: lookup, error } = await supabase.rpc(
      "find_study_room_by_code",
      { _code: data.code.toUpperCase() }
    );
    if (error) throw dbError(error);
    const found = (lookup ?? [])[0] ?? null;
    if (!found) throw new Error("No study room with that code.");
    const { data: full } = await supabase
      .from("study_rooms")
      .select("id, code, name, host_id, model, is_open, created_at")
      .eq("id", found.id)
      .maybeSingle();
    const room = full ?? {
      ...found,
      host_id: null as string | null,
      model: "dap-ai-lite",
      created_at: null as string | null,
    };

    const { data: members } = await supabase
      .from("study_room_members")
      .select("user_id, display_name")
      .eq("room_id", room.id);
    const isMember = (members ?? []).some(
      (m: { user_id: string }) => m.user_id === userId
    );
    if (!isMember) return { room: { ...room, joined: false }, members: [], messages: [] };

    const { data: messages } = await supabase
      .from("study_room_messages")
      .select("id, user_id, author_name, role, content, created_at")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true })
      .limit(200);

    return {
      room: { ...room, joined: true, isHost: room.host_id === userId },
      members: members ?? [],
      messages: messages ?? [],
    };
  });

export const listMyStudyRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships } = await supabase
      .from("study_room_members")
      .select("room_id")
      .eq("user_id", userId);
    const ids = (memberships ?? []).map((m: { room_id: string }) => m.room_id);
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("study_rooms")
      .select("id, code, name, host_id, is_open, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
    return (data ?? []).map((r: any) => ({ ...r, isHost: r.host_id === userId }));
  });

/** Remove a room from only the caller's account. The room and transcript
 * remain available to every other member, including when the caller hosted it. */
export const leaveStudyRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ roomId: z.string().uuid() }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("study_room_members")
      .delete()
      .eq("room_id", data.roomId)
      .eq("user_id", context.userId);
    if (error) throw dbError(error);
    return { ok: true };
  });

export const setStudyRoomOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ roomId: z.string().uuid(), open: z.boolean() }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("study_rooms")
      .update({ is_open: data.open })
      .eq("id", data.roomId)
      .eq("host_id", userId);
    if (error) throw dbError(error);
    return { ok: true };
  });

/**
 * Post a message to the room and, when the message is addressed to DAP AI,
 * generate one shared reply. The assistant row is written with the service
 * role because RLS only lets members insert their own `user` rows.
 */
export const postStudyRoomMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        roomId: z.string().uuid(),
        text: z.string().trim().min(1).max(4000),
        askAi: z.boolean().optional().default(true),
        model: z.enum(MODEL_IDS).optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: room, error: roomError } = await supabase
      .from("study_rooms")
      .select("id, model, is_open")
      .eq("id", data.roomId)
      .maybeSingle();
    if (roomError) throw dbError(roomError);
    if (!room) throw new Error("That study room no longer exists.");
    if (!room.is_open) throw new Error("That study room has been closed.");

    // The reply runs on the sender's plan: they pick the model, it must be
    // allowed by their own tier, and the usage counts against their account.
    const { data: me } = await supabase
      .from("profiles")
      .select("tier, pro_messages_used")
      .eq("id", userId)
      .maybeSingle();
    const myTier = ((me?.tier as Tier | null) ?? "free") as Tier;
    const requested = (data.model ?? room.model ?? "dap-ai-lite") as ModelId;
    const info = modelInfo(requested) ?? modelInfo("dap-ai-lite")!;
    if (TIER_RANK[myTier] < TIER_RANK[info.minTier]) {
      throw new Error(
        `${info.label} needs the ${info.minTier} plan. Pick another model or upgrade.`
      );
    }
    const chosen = info.id;

    const author = await displayName(supabase, userId);
    const { error } = await supabase.from("study_room_messages").insert({
      room_id: data.roomId,
      user_id: userId,
      author_name: author,
      role: "user",
      content: data.text,
    });
    if (error) throw dbError(error);


    if (!data.askAi) return { ok: true, replied: false };

    const { data: history } = await supabase
      .from("study_room_messages")
      .select("author_name, role, content")
      .eq("room_id", data.roomId)
      .order("created_at", { ascending: false })
      .limit(20);

    const transcript = (history ?? [])
      .slice()
      .reverse()
      .map((m: { author_name: string; role: string; content: string }) =>
        m.role === "assistant"
          ? { role: "assistant" as const, content: m.content }
          : { role: "user" as const, content: `${m.author_name}: ${m.content}` }
      );

    const { offlineMessage } = await import("./offline-message.server");
    let reply = "";
    try {
      reply = (
        await completeOnce(
          chosen,
          [
            {
              role: "system",
              content:
                "You are DAP AI in a shared Study Room with several people at once. Messages are prefixed with the sender's first name. Address people by first name, keep answers focused and under 200 words, and help the whole group learn rather than just handing over answers.",
            },
            ...transcript,
          ],
          { timeoutMs: 120_000 }
        )
      ).trim();
    } catch (e) {
      console.error(
        `[rooms] ${chosen} reply failed:`,
        e instanceof Error ? e.message : e
      );
      throw new Error(await offlineMessage());
    }
    if (!reply) throw new Error(await offlineMessage());

    // Count the reply against the sender's own usage.
    await supabase
      .from("profiles")
      .update({ pro_messages_used: (me?.pro_messages_used ?? 0) + 1 })
      .eq("id", userId);


    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await supabaseAdmin.from("study_room_messages").insert({
      room_id: data.roomId,
      user_id: null,
      author_name: "DAP AI",
      role: "assistant",
      content: reply,
    });
    return { ok: true, replied: true };
  });
