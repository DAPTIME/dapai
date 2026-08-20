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
import { normalizeRoomCode } from "./room-code";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin, isAdminUser } from "./admin.server";
import { assertAdminSecret } from "@/lib/admin-secret.server";
import { dbError } from "./db-error";
import { firstName } from "./utils";
import { orchestratorComplete, OrchestratorUnavailableError } from "./dap-orchestrator.server";
import { modelInfo, orchestratorModelName, MODEL_IDS, type ModelId } from "./models";
import { TIER_RANK } from "./tier-rank";
import { TIER_LIMITS } from "./usage-limits";
import type { Tier } from "./tier-gate";
import { chargeForPrompt, refundPrompt, type Charged } from "@/lib/charge-usage.server";


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
  /* Deliberately not data.email: this label is shown to everyone else in
     the room, and firstName() strips the domain off an address rather than
     rejecting it — which turned "someone@example.com" into "Someone".
     A member who set no name shows as a neutral label instead. */
  return firstName(data?.name, "Guest");
}

/** What someone is told when the room they were in has been closed down. */
export const ROOM_DELETED_NOTICE =
  "Sorry, this room has been deleted by the admin. Please contact us for any inquiries.";

/**
 * Does study_rooms carry the soft-delete columns yet?
 *
 * Closing a room down marks it rather than dropping it, which needs
 * deleted_at/deleted_by — added by
 * supabase/migrations/20260815120000_study_room_join_and_admin.sql. Until
 * that migration is applied the columns are absent, and every query naming
 * one fails with 42703, which would take the room page down with it.
 *
 * So the shape is probed once and remembered. Everything that reads a room
 * keeps working without the columns; only closing a room actually needs
 * them, and that says so plainly instead of failing as a bug. Once the
 * migration lands the probe flips on its own — the cache lives for the life
 * of a worker, not forever.
 */
async function hasSoftDelete(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("study_rooms")
    .select("deleted_at")
    .limit(1);
  // 42703 is "column does not exist"; PGRST204 is PostgREST saying the same
  // from its schema cache. Anything else is a database that is unwell, and
  // guessing "no column" from it would hide the real fault — so only these
  // two count as absent, and the rest are retried on the next call.
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return false;
    }
    return false;
  }
  return true;
}

/**
 * Is the join-approval column there yet?
 *
 * Same shape, and same reason, as hasSoftDelete: this repo's migrations and
 * its deploys do not land in lockstep, and code that assumes a column that
 * has not arrived takes the feature down rather than degrading. When the
 * column is missing, joining behaves as it always did — straight in — and
 * starts requiring approval the moment the migration lands, with no second
 * deploy needed.
 */
async function hasJoinApproval(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("study_room_members")
    .select("status")
    .limit(1);
  return !error;
}

/** The columns a room is read with, which depends on the above. */
const roomColumns = (soft: boolean) =>
  `id, code, name, host_id, model, is_open, created_at${soft ? ", deleted_at" : ""}`;

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

    /* The host joins their own room through the trusted client, and the
       result is checked.

       This insert went through the caller's client and its error was
       thrown away. The policy behind it calls can_join_study_room, which
       spent a day with EXECUTE revoked — so the insert failed, silently,
       and the person who had just made a room was not in it. That is why
       "Your rooms" stayed empty after creating one, with nothing on screen
       to say so.

       Someone creating a room is allowed to be in it by definition, and
       requireSupabaseAuth has already established who they are, so there
       is nothing here for the policy to decide. */
    const { error: memberError } = await supabaseAdmin.from("study_room_members").insert({
      room_id: room.id,
      user_id: userId,
      display_name: await displayName(supabase, userId),
    });
    if (memberError) {
      console.error(
        `[rooms] host could not join own room: ${memberError.code ?? "?"} ${memberError.message}`,
      );
      throw dbError(memberError);
    }
    return room;
  });

export const joinStudyRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        code: z
          .string()
          .transform(normalizeRoomCode)
          .pipe(
            z
              .string()
              .min(4, "That room code looks too short — codes are 6 characters.")
              .max(10, "That room code looks too long — codes are 6 characters.")
          ),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    /* Joining used to resolve the code and then upsert a membership row
       using the browser's own key — an INSERT ... ON CONFLICT DO UPDATE
       needing the INSERT grant, the INSERT policy, the UPDATE grant and the
       UPDATE policy all to line up. Four things across three migrations,
       any one of which produced the same silent "joining doesn't work".

       This runs on the server, which has already established who the caller
       is, so it does the checks itself and writes with the service role.
       The decision of who may join is made here in one place, in the open,
       rather than emerging from four separate pieces of database
       configuration that have to agree. */
    const { userId } = context;
    const code = data.code.trim().toUpperCase();
    const soft = await hasSoftDelete();

    const { data: room, error } = await supabaseAdmin
      .from("study_rooms")
      .select(roomColumns(soft))
      .eq("code", code)
      .maybeSingle<{
        id: string;
        code: string;
        name: string;
        host_id: string | null;
        is_open: boolean;
        deleted_at?: string | null;
      }>();
    if (error) throw dbError(error);
    if (!room) throw new Error("No study room with that code.");
    if (room.deleted_at) throw new Error(ROOM_DELETED_NOTICE);
    if (!room.is_open) throw new Error("That study room has been closed.");

    /* You ask as yourself: the id comes from the verified session, never
       from anything the caller sent.

       A code is one short string that spreads by being pasted, so anyone
       who ends up with it used to be in the room whether the host wanted
       them or not. Now a join is a request, and the host decides. The host
       joining their own room is not a request — createStudyRoom writes that
       membership approved — and an existing member re-entering keeps
       whatever status they already had, so approving somebody once is
       enough. */
    const approvals = await hasJoinApproval();
    const { data: existing } = await supabaseAdmin
      .from("study_room_members")
      .select(approvals ? "user_id, status" : "user_id")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .maybeSingle<{ user_id: string; status?: string }>();

    if (!existing) {
      const isHost = room.host_id === userId;
      const { error: joinError } = await supabaseAdmin
        .from("study_room_members")
        .insert({
          room_id: room.id,
          user_id: userId,
          display_name: await displayName(supabaseAdmin, userId),
          ...(approvals ? { status: isHost ? "approved" : "pending" } : {}),
        });
      if (joinError) throw dbError(joinError);
      return {
        id: room.id,
        code: room.code,
        name: room.name,
        status: approvals && !isHost ? "pending" : "approved",
      };
    }

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      status: (existing.status as string | undefined) ?? "approved",
    };
  });

/**
 * Every room on the site, for the admin console.
 *
 * Admin is profiles.site_admin, checked here on the server before the
 * service role is used for anything — the client is never asked whether it
 * is allowed.
 */
export const adminListStudyRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const soft = await hasSoftDelete();

    const { data: rooms, error } = await supabaseAdmin
      .from("study_rooms")
      .select(roomColumns(soft))
      .order("created_at", { ascending: false })
      .returns<
        Array<{
          id: string;
          code: string;
          name: string;
          host_id: string | null;
          model: string;
          is_open: boolean;
          created_at: string;
          deleted_at?: string | null;
        }>
      >();
    if (error) throw dbError(error);
    if (!rooms?.length) return [];

    const hostIds = [...new Set(rooms.map((r) => r.host_id).filter(Boolean))];
    const { data: hosts } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .in("id", hostIds as string[]);
    const hostName = new Map(
      (hosts ?? []).map((h: { id: string; name: string | null; email: string | null }) => [
        h.id,
        h.name?.trim() || h.email || "Unknown",
      ])
    );

    // Counted per room with a HEAD request rather than by pulling every row
    // and tallying in memory: PostgREST caps a select at a page of rows, so
    // tallying would quietly under-report a busy room.
    const counts = await Promise.all(
      rooms.map(async (r) => {
        const [members, messages] = await Promise.all([
          supabaseAdmin
            .from("study_room_members")
            .select("*", { count: "exact", head: true })
            .eq("room_id", r.id),
          supabaseAdmin
            .from("study_room_messages")
            .select("*", { count: "exact", head: true })
            .eq("room_id", r.id),
        ]);
        return { member_count: members.count ?? 0, message_count: messages.count ?? 0 };
      })
    );

    return rooms.map((r, i) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      model: r.model,
      is_open: r.is_open,
      created_at: r.created_at,
      deleted_at: r.deleted_at ?? null,
      host_name: (r.host_id && hostName.get(r.host_id)) || "Unknown",
      ...counts[i],
    }));
  });

/** Raised when closing a room needs a migration that has not been applied. */
const SOFT_DELETE_MISSING =
  "Closing a room needs the deleted_at column on study_rooms, which this " +
  "database does not have yet. Apply " +
  "supabase/migrations/20260815120000_study_room_join_and_admin.sql and try again.";

/**
 * Close a room down.
 *
 * A soft delete: the row stays so the people who were in it can be told
 * why it is gone. Dropping it would give them "no room with that code",
 * which reads as a fault rather than a decision — and would make an
 * accidental deletion unrecoverable.
 */
export const adminDeleteStudyRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId, context.supabase);
    assertAdminSecret();
    if (!(await hasSoftDelete())) throw new Error(SOFT_DELETE_MISSING);

    const { data: rows, error } = await supabaseAdmin
      .from("study_rooms")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: context.userId,
        is_open: false,
      })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id");
    if (error) throw dbError(error);
    return { ok: (rows ?? []).length > 0 };
  });

/**
 * Put a closed room back.
 *
 * Deleting the wrong room by one misread code is an easy mistake, and a
 * soft delete is what makes it a recoverable one.
 */
export const adminRestoreStudyRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId, context.supabase);
    assertAdminSecret();
    if (!(await hasSoftDelete())) throw new Error(SOFT_DELETE_MISSING);

    const { data: rows, error } = await supabaseAdmin
      .from("study_rooms")
      .update({ deleted_at: null, deleted_by: null, is_open: true })
      .eq("id", data.id)
      .not("deleted_at", "is", null)
      .select("id");
    if (error) throw dbError(error);
    return { ok: (rows ?? []).length > 0 };
  });

/**
 * Who is waiting to be let into a room, for the host.
 *
 * Returns [] when the approval column has not landed yet, and [] for anyone
 * who is not the host — a waiting list is the host's business, and someone
 * else's pending request is not something a member needs to see.
 */
export const listJoinRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ roomId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    if (!(await hasJoinApproval())) return [];

    const { data: room } = await supabaseAdmin
      .from("study_rooms")
      .select("id, host_id")
      .eq("id", data.roomId)
      .maybeSingle<{ id: string; host_id: string | null }>();
    if (!room || room.host_id !== userId) return [];

    const { data: rows } = await supabaseAdmin
      .from("study_room_members")
      .select("user_id, display_name, joined_at")
      .eq("room_id", data.roomId)
      .eq("status", "pending")
      .order("joined_at", { ascending: true });
    return (rows ?? []) as Array<{
      user_id: string;
      display_name: string;
      joined_at: string;
    }>;
  });

/**
 * The host lets somebody in, or turns them away.
 *
 * Declining removes the row rather than marking it declined, so the person
 * can ask again later — a "no" here is about this moment, not a ban. The
 * host is the only one who may do either, and that is checked here rather
 * than left to a policy, because this writes with the service role.
 */
export const decideJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        roomId: z.string().uuid(),
        userId: z.string().uuid(),
        approve: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { userId: callerId } = context;
    if (!(await hasJoinApproval())) {
      throw new Error("Approving members isn't available yet.");
    }

    const { data: room } = await supabaseAdmin
      .from("study_rooms")
      .select("id, host_id")
      .eq("id", data.roomId)
      .maybeSingle<{ id: string; host_id: string | null }>();
    if (!room) throw new Error("No study room with that code.");
    if (room.host_id !== callerId) {
      throw new Error("Only the person who made the room can let people in.");
    }

    if (data.approve) {
      const { error } = await supabaseAdmin
        .from("study_room_members")
        .update({ status: "approved" })
        .eq("room_id", data.roomId)
        .eq("user_id", data.userId);
      if (error) throw dbError(error);
      return { ok: true, approved: true };
    }

    const { error } = await supabaseAdmin
      .from("study_room_members")
      .delete()
      .eq("room_id", data.roomId)
      .eq("user_id", data.userId)
      .eq("status", "pending");
    if (error) throw dbError(error);
    return { ok: true, approved: false };
  });

export const getStudyRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        code: z
          .string()
          .transform(normalizeRoomCode)
          .pipe(
            z
              .string()
              .min(4, "That room code looks too short — codes are 6 characters.")
              .max(10, "That room code looks too long — codes are 6 characters.")
          ),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    /* One lookup, with the trusted client, exactly the way joinStudyRoom
       does it.

       This used to call find_study_room_by_code through the caller's own
       client. EXECUTE on that function was revoked from anon and
       authenticated on purpose — a six-character code from a small alphabet
       is guessable, and an open /rest/v1/rpc endpoint would let anyone
       signed in walk the space and find rooms they were never given a code
       for — so every lookup came back "permission denied" and the page
       said "Room not found" for rooms that existed.

       Reading the table directly with the service-role client needs no
       grant at all, so the endpoint stays shut and there is one less thing
       that has to be granted correctly for Study Rooms to work. This
       handler is already gated by requireSupabaseAuth, and who may *read*
       a room is still decided by the membership checks below. */
    const soft = await hasSoftDelete();
    const { data: room, error } = await supabaseAdmin
      .from("study_rooms")
      .select(roomColumns(soft))
      .eq("code", data.code.toUpperCase())
      .maybeSingle<{
        id: string;
        code: string;
        name: string;
        host_id: string | null;
        model: string;
        is_open: boolean;
        created_at: string | null;
        deleted_at?: string | null;
      }>();
    if (error) {
      // The code goes to the reader, the whole error to the log: enough to
      // tell two failures apart without a generic "something went wrong".
      console.error(`[rooms] room lookup failed: ${error.code ?? "?"} ${error.message}`);
      throw new Error(
        `Couldn't load that room (${error.code ?? "unknown"}). Please try again.`,
      );
    }
    if (!room) throw new Error("No study room with that code.");

    // A deleted room still resolves, so its members get an explanation
    // instead of the "no room with that code" they'd get from a hard
    // delete — which reads as a fault rather than a decision.
    if ((room as { deleted_at?: string | null }).deleted_at) {
      return {
        room: { ...room, joined: false, deleted: true },
        members: [],
        messages: [],
      };
    }

    /* Only approved people are in the room. Someone who has asked and not
       been let in yet is not a member: they are not listed, they cannot
       read the transcript, and the page tells them they are waiting.

       Read with the trusted client and filtered here, so the member list
       does not depend on a policy being written to exclude pending rows. */
    const approvals = await hasJoinApproval();
    const { data: allMembers } = await supabaseAdmin
      .from("study_room_members")
      .select(approvals ? "user_id, display_name, status" : "user_id, display_name")
      .eq("room_id", room.id);
    // Cast through unknown: the column list is chosen at runtime, which
    // supabase-js's return-type parser cannot follow.
    const memberRows = (allMembers ?? []) as unknown as Array<{
      user_id: string;
      display_name: string;
      status?: string;
    }>;
    const isApproved = (m: { status?: string }) =>
      !approvals || (m.status ?? "approved") === "approved";
    const members = memberRows.filter(isApproved);
    const mine = memberRows.find((m) => m.user_id === userId);
    const isMember = !!mine && isApproved(mine);

    // Asked, not yet let in: say so rather than showing an empty room.
    if (mine && !isMember) {
      return {
        room: { ...room, joined: false, pending: true },
        members: [],
        messages: [],
      };
    }

    /* Site admins can read a room they have not joined, without joining it.
       Moderating a live room previously meant joining it, which announced
       itself twice over: a row in study_room_members that everyone sees in
       the member list, and a presence entry on the realtime channel. Both
       change the room being observed.

       So this returns the transcript to an admin while deliberately doing
       none of the things joining does — no membership row is written, no
       display name is repaired, and `joined` stays false so nothing
       downstream treats them as a participant. `observing` is the flag the
       room page uses to subscribe for live messages without broadcasting
       presence, and to hide the composer: an admin who posted would reveal
       themselves anyway, so watching is all this grants.

       Admins with a real membership row fall through to the normal path
       below and appear like any other member, which is what they chose. */
    if (!isMember) {
      const observing = await isAdminUser(userId, supabase).catch(() => false);
      if (!observing) {
        return { room: { ...room, joined: false }, members: [], messages: [] };
      }
      const { data: observedMessages } = await supabase
        .from("study_room_messages")
        .select("id, user_id, author_name, role, content, created_at")
        .eq("room_id", room.id)
        .order("created_at", { ascending: true })
        .limit(200);
      return {
        room: { ...room, joined: false, observing: true, isHost: false },
        members: members ?? [],
        messages: (observedMessages ?? []).map((message: any) => {
          if (message.role === "assistant") return message;
          const member = (members ?? []).find(
            (c: { user_id: string }) => c.user_id === message.user_id
          );
          return member?.display_name
            ? { ...message, author_name: member.display_name }
            : message;
        }),
      };
    }

    // Repair old memberships saved as "Guest" and keep room identity synced
    // with the caller's current profile name.
    const currentName = await displayName(supabase, userId);
    const callerMembership = (members ?? []).find(
      (member: { user_id: string }) => member.user_id === userId
    );
    if (callerMembership?.display_name !== currentName) {
      await supabase
        .from("study_room_members")
        .update({ display_name: currentName })
        .eq("room_id", room.id)
        .eq("user_id", userId);
      if (callerMembership) callerMembership.display_name = currentName;
    }

    const { data: messages } = await supabase
      .from("study_room_messages")
      .select("id, user_id, author_name, role, content, created_at")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true })
      .limit(200);

    const normalizedMessages = (messages ?? []).map((message: any) => {
      if (message.role === "assistant") return message;
      const member = (members ?? []).find(
        (candidate: { user_id: string }) => candidate.user_id === message.user_id
      );
      return member?.display_name
        ? { ...message, author_name: member.display_name }
        : message;
    });

    return {
      room: { ...room, joined: true, isHost: room.host_id === userId },
      members: members ?? [],
      messages: normalizedMessages,
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
    /* A room message addressed to DAP AI runs the same hardware as a
       private chat, so it costs the same. This was free before, which made
       a study room a way around the allowance rather than a feature of it.
       Only charged when the message actually asks for a reply. */
    let roomCharge: Charged = { cost: 0, images: 0 };
    if (data.askAi !== false) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("tier")
        .eq("id", context.userId)
        .maybeSingle();
      roomCharge = await chargeForPrompt(
        context.supabase,
        (prof?.tier as Tier) ?? "free",
        data.text
      );
    }

    const { supabase, userId } = context;
    const soft = await hasSoftDelete();
    const { data: room, error: roomError } = await supabase
      .from("study_rooms")
      .select(`id, model, is_open${soft ? ", deleted_at" : ""}`)
      .eq("id", data.roomId)
      .maybeSingle<{ id: string; model: string; is_open: boolean; deleted_at?: string | null }>();
    if (roomError) throw dbError(roomError);
    if (!room) throw new Error("That study room no longer exists.");
    // A tab left open would otherwise keep talking to a room the owner has
    // closed down.
    if (room.deleted_at) throw new Error(ROOM_DELETED_NOTICE);
    if (!room.is_open) throw new Error("That study room has been closed.");

    /* Only members may post. This was unchecked: the handler verified the
       room existed and was open but never that the sender belonged to it,
       so anyone signed in who had a room's id could write into a private
       room without joining it. createStudyRoom inserts the creator as a
       member, so hosts satisfy this too.

       It is also what makes admin observation honest — an admin reading a
       room they have not joined holds no membership row, so the server
       refuses a post from them exactly as the hidden composer does. */
    const { data: membership } = await supabase
      .from("study_room_members")
      .select("user_id")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      throw new Error("Join this room before sending a message.");
    }

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

    /* How far back DAP AI can see follows the plan of whoever asked, the
       same rule as a one-to-one chat, rather than a fixed 20 for everyone.
       A turn is a message and its reply. */
    const { data: history } = await supabase
      .from("study_room_messages")
      .select("author_name, role, content")
      .eq("room_id", data.roomId)
      .order("created_at", { ascending: false })
      .limit(TIER_LIMITS[myTier].historyTurns * 2);

    const transcript = (history ?? [])
      .slice()
      .reverse()
      .map((m: { author_name: string; role: string; content: string }) =>
        m.role === "assistant"
          ? { role: "assistant" as const, content: m.content }
          : { role: "user" as const, content: `${m.author_name}: ${m.content}` }
      );

    /* Take a slot before dialling the orchestrator, the same as a
       one-to-one chat does. Inference runs on one box, and this path was
       going straight at it: a room reply could start while a chat
       generation was already running, so the queue that exists to stop
       exactly that was being bypassed by every room message.

       Best-effort on purpose — the queue must never be what stops a room
       working, which is the same call api/chat.ts makes. */
    const { data: roomTicket } = await Promise.resolve(
      supabase.rpc("queue_join", {}).maybeSingle(),
    ).catch(() => ({ data: null }) as { data: null });
    const roomTicketId = (roomTicket as { id?: string } | null)?.id ?? null;
    if (roomTicketId) {
      await Promise.resolve(supabase.rpc("queue_claim", { _id: roomTicketId })).catch(() => {});
    }
    const releaseRoomSlot = async (cancelled: boolean) => {
      if (!roomTicketId) return;
      await Promise.resolve(
        supabase.rpc("queue_release", { _id: roomTicketId, _cancelled: cancelled }),
      ).catch(() => {});
    };

    const { BACKEND_UNREACHABLE } = await import("./offline-message.server");
    let reply = "";
    try {
      reply = (
        await orchestratorComplete({
          tier: myTier,
          model: orchestratorModelName(chosen),
          messages: [
            {
              role: "system",
              content:
                "You are DAP AI in a shared Study Room with several people at once. Messages are prefixed with the sender's first name. Address people by first name, keep answers focused and under 200 words, and help the whole group learn rather than just handing over answers.",
            },
            ...transcript,
          ],
          timeoutMs: 120_000,
        })
      ).trim();
    } catch (e) {
      console.error(
        `[rooms] ${chosen} reply failed:`,
        e instanceof Error ? e.message : e
      );
      await releaseRoomSlot(true);
      // The room got no answer, so the sender keeps their tokens.
      await refundPrompt(context.userId, roomCharge);
      throw new Error(BACKEND_UNREACHABLE);
    }
    if (!reply) {
      await releaseRoomSlot(true);
      await refundPrompt(context.userId, roomCharge);
      throw new Error(BACKEND_UNREACHABLE);
    }
    await releaseRoomSlot(false);

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
