/**
 * Server functions for the two-lane AI request queue.
 *
 * Thin wrappers over the SQL in
 * supabase/migrations/20260817100000_ai_request_queue.sql. The decisions —
 * which lane, who is next, whether a slot is free — all live in the
 * database, because it is the only place there is exactly one of.
 *
 * Every call runs as the caller, so the functions key on auth.uid() and a
 * ticket cannot be inspected or released by anyone but its owner.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "./db-error";

export type QueueTicket = {
  id: string;
  lane: "a" | "b";
  /** 0 when running, otherwise how many are ahead plus one. */
  position: number;
  state: "waiting" | "running" | "done" | "cancelled";
};

/**
 * The SQL calls the column `pos`, not `position` — `position` is a reserved
 * word in Postgres and a RETURNS TABLE cannot use it. Renamed here at the
 * boundary so the rest of the app reads the word it means.
 */
type QueueRow = { id: string; lane: string; pos: number; state: string };

const toTicket = (row: QueueRow | null): QueueTicket | null =>
  row
    ? {
        id: row.id,
        lane: row.lane === "a" ? "a" : "b",
        position: row.pos,
        state: row.state as QueueTicket["state"],
      }
    : null;

/**
 * Is this "the queue isn't installed yet" rather than a real failure?
 *
 * Same reasoning as the usage ledger: if the migration has not run, the
 * honest reading is that no queue is configured, not that everyone must
 * wait forever. Chat carries on unqueued rather than going down for the
 * minutes between a deploy and its migration.
 */
export function isQueueMissing(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  if (err.code === "42883" || err.code === "PGRST202" || err.code === "42P01") return true;
  return /could not find the function|does not exist|schema cache/i.test(err.message ?? "");
}

const idInput = (i: unknown) => z.object({ id: z.string().uuid() }).parse(i);

/** Take a ticket, or return the one this account already holds. */
export const joinAiQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ chatId: z.string().uuid().optional() }).parse(i ?? {})
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .rpc("queue_join", { _chat_id: data.chatId ?? null })
      .maybeSingle();
    if (error) {
      if (isQueueMissing(error)) return null;
      throw dbError(error, "queue_join");
    }
    return toTicket((row ?? null) as QueueRow | null);
  });

/**
 * Ask whether this ticket may go now.
 *
 * Polled by the client. Returns the ticket alongside the answer so one
 * round trip both advances the queue and refreshes the position shown.
 */
export const claimAiQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ context, data }) => {
    const { data: ok, error } = await context.supabase.rpc("queue_claim", {
      _id: data.id,
    });
    if (error) {
      if (isQueueMissing(error)) return { ready: true, ticket: null, etaSeconds: null };
      throw dbError(error, "queue_claim");
    }
    if (ok === true) return { ready: true, ticket: null, etaSeconds: null };

    const { data: ticket } = await context.supabase
      .rpc("queue_status", { _id: data.id })
      .maybeSingle();
    const t = toTicket((ticket ?? null) as QueueRow | null);

    let etaSeconds: number | null = null;
    if (t && t.position > 0) {
      const { data: per } = await context.supabase.rpc("queue_eta_seconds", {
        _lane: t.lane,
      });
      // No history means no estimate. An invented "about 30s" is worse
      // than showing nothing, because people plan around it.
      if (typeof per === "number" && per > 0) etaSeconds = per * t.position;
    }
    return { ready: false, ticket: t, etaSeconds };
  });

/** Give the slot back — on success, on failure, and on cancel. */
export const releaseAiQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), cancelled: z.boolean().optional() }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("queue_release", {
      _id: data.id,
      _cancelled: data.cancelled ?? false,
    });
    if (error && !isQueueMissing(error)) throw dbError(error, "queue_release");
    return { ok: true };
  });

/**
 * Say the request is still alive.
 *
 * A browser that closes mid-generation never releases, so a running ticket
 * that stops beating for two minutes is reaped and its slot returned.
 */
export const beatAiQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("queue_beat", { _id: data.id });
    if (error && !isQueueMissing(error)) throw dbError(error, "queue_beat");
    return { ok: true };
  });
