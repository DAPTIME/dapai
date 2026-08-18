/**
 * Study Mode flashcards. Cards are generated from a chat through the DAP
 * orchestrator and reviewed with a simplified SM-2 spaced-repetition
 * schedule.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "./db-error";
import { orchestratorComplete, OrchestratorUnavailableError } from "./dap-orchestrator.server";
import { MODEL_IDS } from "@/lib/models";
import { sanitizeLiteReply } from "@/lib/lite-sanitize";
import { chargeForPrompt, refundPrompt } from "@/lib/charge-usage.server";
import type { Tier } from "@/lib/tier-rank";

const MAX_CARDS_PER_CHAT = 20;

export const listFlashcards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("flashcards")
      .select(
        "id, chat_id, front, back, ease, interval_days, reps, due_at, created_at"
      )
      .order("due_at", { ascending: true });
    if (error) throw dbError(error);
    return data ?? [];
  });

export const generateFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        chatId: z.string().uuid(),
        model: z.enum(MODEL_IDS).default("dap-ai-lite"),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: chat, error: chatErr } = await supabase
      .from("chats")
      .select("id")
      .eq("id", data.chatId)
      .maybeSingle();
    if (chatErr) throw dbError(chatErr);
    if (!chat) throw new Error("Chat not found.");

    const { data: msgs, error: msgErr } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });
    if (msgErr) throw dbError(msgErr);

    const transcript = (msgs ?? [])
      .filter((m) => m.role !== "system")
      .slice(-40)
      .map(
        (m) =>
          `${m.role === "user" ? "Student" : "Tutor"}: ${sanitizeLiteReply(
            m.content
          ).slice(0, 1200)}`
      )
      .join("\n\n");

    if (!transcript.trim()) {
      throw new Error("This chat has nothing to make flashcards from yet.");
    }

    /* Generating cards is a model call like any other and was not being
       charged. Priced off the transcript, which is what is actually sent. */
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("tier")
      .eq("id", context.userId)
      .maybeSingle();
    const cardsCharge = await chargeForPrompt(
      context.supabase,
      (prof?.tier as Tier) ?? "free",
      transcript
    );

    let raw: string;
    try {
      raw = await orchestratorComplete({
        tier: (prof?.tier as Tier) ?? "free",
        messages: [
          {
            role: "system",
            content:
              'You create study flashcards. Read the conversation and output STRICT JSON only: {"cards":[{"front":"question","back":"answer"}]}. Between 3 and 12 cards. Each front is a single clear question under 160 chars; each back is a concise factual answer under 300 chars. Cover only the study material in the conversation — no meta questions about the chat itself. No markdown, no commentary.',
          },
          { role: "user", content: transcript },
        ],
        timeoutMs: 90_000,
      });
    } catch (e) {
      // No cards were produced, so the charge should not stand.
      await refundPrompt(context.userId, cardsCharge);
      throw e instanceof OrchestratorUnavailableError
        ? new Error("DAP AI is offline right now — try again in a moment.")
        : e;
    }

    const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    let cards: Array<{ front: string; back: string }> = [];
    try {
      const parsed = JSON.parse(jsonText) as { cards?: unknown };
      if (Array.isArray(parsed.cards)) {
        cards = parsed.cards
          .filter(
            (c): c is { front: string; back: string } =>
              !!c &&
              typeof (c as { front?: unknown }).front === "string" &&
              typeof (c as { back?: unknown }).back === "string"
          )
          .map((c) => ({
            front: c.front.trim().slice(0, 200),
            back: c.back.trim().slice(0, 500),
          }))
          .filter((c) => c.front.length > 0 && c.back.length > 0)
          .slice(0, MAX_CARDS_PER_CHAT);
      }
    } catch {
      /* handled below */
    }

    if (cards.length === 0) {
      throw new Error(
        "Couldn't turn this chat into flashcards — try again once there's more study material."
      );
    }

    const { data: rows, error } = await supabase
      .from("flashcards")
      .insert(
        cards.map((c) => ({
          user_id: userId,
          chat_id: data.chatId,
          front: c.front,
          back: c.back,
        }))
      )
      .select(
        "id, chat_id, front, back, ease, interval_days, reps, due_at, created_at"
      );
    if (error) throw dbError(error);
    return rows ?? [];
  });

/**
 * Grade a review. quality: 0 = forgot, 1 = hard, 2 = good, 3 = easy.
 * Simplified SM-2: forgetting resets the interval, everything else grows it
 * by the current ease factor.
 */
export const reviewFlashcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ id: z.string().uuid(), quality: z.number().int().min(0).max(3) })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: card, error: getErr } = await supabase
      .from("flashcards")
      .select("id, ease, interval_days, reps")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw dbError(getErr);
    if (!card) throw new Error("Card not found.");

    let ease = card.ease ?? 2.5;
    let interval = card.interval_days ?? 0;
    let reps = card.reps ?? 0;

    if (data.quality === 0) {
      reps = 0;
      interval = 0;
      ease = Math.max(1.3, ease - 0.2);
    } else {
      reps += 1;
      if (data.quality === 1) ease = Math.max(1.3, ease - 0.15);
      if (data.quality === 3) ease = Math.min(3.0, ease + 0.1);
      if (reps === 1) interval = 1;
      else if (reps === 2) interval = 3;
      else interval = Math.round(Math.max(1, interval) * ease);
      interval = Math.min(interval, 365);
    }

    const dueAt = new Date(
      Date.now() + (interval > 0 ? interval * 86_400_000 : 10 * 60_000)
    ).toISOString();

    const { data: row, error } = await supabase
      .from("flashcards")
      .update({
        ease,
        interval_days: interval,
        reps,
        due_at: dueAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select(
        "id, chat_id, front, back, ease, interval_days, reps, due_at, created_at"
      )
      .single();
    if (error) throw dbError(error);
    return row;
  });

export const deleteFlashcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("flashcards")
      .delete()
      .eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true };
  });
