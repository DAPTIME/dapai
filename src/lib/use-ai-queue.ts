/**
 * Waiting for a slot, from the browser's side.
 *
 * `wait()` resolves once this request may dial the orchestrator, and
 * reports the live position while it waits. Call `release()` when the
 * reply lands, when it fails, and when the person gives up — the slot has
 * to come back on every one of those paths, which is why it is a single
 * method rather than three.
 *
 * The ticket lives in the database, so reloading the page rejoins the same
 * place in line rather than going to the back of it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Tier } from "@/lib/tier-rank";
import { useServerFn } from "@tanstack/react-start";
import {
  joinAiQueue,
  claimAiQueue,
  releaseAiQueue,
  beatAiQueue,
} from "@/lib/ai-queue.functions";

export type QueueView = {
  /** Waiting for a slot, as opposed to generating. */
  waiting: boolean;
  /** 1 means next. Null while unknown. */
  position: number | null;
  /** Seconds, or null when there is no history to estimate from. */
  etaSeconds: number | null;
};

const POLL_MS = 1_500;
const BEAT_MS = 30_000;

export function useAiQueue() {
  const join = useServerFn(joinAiQueue);
  const claim = useServerFn(claimAiQueue);
  const release = useServerFn(releaseAiQueue);
  const beat = useServerFn(beatAiQueue);

  const [view, setView] = useState<QueueView>({
    waiting: false,
    position: null,
    etaSeconds: null,
  });

  const ticketRef = useRef<string | null>(null);
  const abandoned = useRef(false);
  const beatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopBeating = useCallback(() => {
    if (beatTimer.current) {
      clearInterval(beatTimer.current);
      beatTimer.current = null;
    }
  }, []);

  /** Hand the slot back. Safe to call more than once. */
  const giveUp = useCallback(
    async (cancelled = false) => {
      const id = ticketRef.current;
      ticketRef.current = null;
      abandoned.current = cancelled;
      stopBeating();
      setView({ waiting: false, position: null, etaSeconds: null });
      if (id) {
        try {
          await release({ data: { id, cancelled } });
        } catch {
          /* the reaper will collect it if this never lands */
        }
      }
    },
    [release, stopBeating]
  );

  /**
   * Resolves when it is this request's turn.
   *
   * Returns false if the caller gave up while waiting, so the send can be
   * abandoned without dialling the orchestrator.
   */
  const wait = useCallback(
    async (chatId?: string): Promise<boolean> => {
      abandoned.current = false;
      let ticket: { id: string; position: number } | null = null;
      try {
        const joined = await join({ data: { chatId } });
        // Null means the queue is not installed; carry on unqueued rather
        // than blocking chat between a deploy and its migration.
        if (!joined) return true;
        ticket = { id: joined.id, position: joined.position };
        ticketRef.current = joined.id;
      } catch {
        return true;
      }

      setView({ waiting: true, position: ticket.position || null, etaSeconds: null });

      for (;;) {
        if (abandoned.current) return false;
        let res: Awaited<ReturnType<typeof claim>>;
        try {
          res = await claim({ data: { id: ticket.id } });
        } catch {
          // A queue that cannot be reached should not hold chat hostage.
          setView({ waiting: false, position: null, etaSeconds: null });
          return true;
        }
        if (res.ready) {
          setView({ waiting: false, position: null, etaSeconds: null });
          // Keep the slot marked alive for as long as we hold it.
          stopBeating();
          beatTimer.current = setInterval(() => {
            const id = ticketRef.current;
            if (id) beat({ data: { id } }).catch(() => {});
          }, BEAT_MS);
          return true;
        }
        // A ticket that vanished (reaped, or cancelled elsewhere) should
        // not spin forever.
        if (res.ticket && res.ticket.state !== "waiting" && res.ticket.state !== "running") {
          setView({ waiting: false, position: null, etaSeconds: null });
          return false;
        }
        setView({
          waiting: true,
          position: res.ticket?.position ?? null,
          etaSeconds: res.etaSeconds,
        });
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    },
    [join, claim, beat, stopBeating]
  );

  /* Cancelling explicitly releases the slot in the same second, which is
     the case the spec cares about. A closed tab cannot: the session token
     lives in localStorage rather than a cookie, so sendBeacon would arrive
     unauthenticated and the release would be rejected — a call that always
     401s is worse than no call, because it reads as covered. That path is
     the heartbeat's job instead: two minutes without a beat and the slot
     is reaped. Unmounting still tries the real release. */
  /* A reload unmounts this hook exactly as navigating away does, and the
     spec is explicit that a queued request survives a refresh. So the two
     have to be told apart: pagehide fires when the document itself is going
     away, and not on an in-app route change. If the page is tearing down we
     leave the ticket alone — a reload rejoins it, because queue_join hands
     back the account's existing live ticket rather than a new one, and a
     tab that is genuinely gone stops beating and gets reaped. */
  const unloadingRef = useRef(false);
  useEffect(() => {
    const onPageHide = () => {
      unloadingRef.current = true;
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    return () => {
      stopBeating();
      const id = ticketRef.current;
      ticketRef.current = null;
      if (id && !unloadingRef.current) {
        release({ data: { id, cancelled: true } }).catch(() => {});
      }
    };
  }, [release, stopBeating]);

  return { view, wait, giveUp };
}

/**
 * How the wait reads to a person.
 *
 * Deliberately not a position. The exact place in line is computed and
 * available — queue_position replays the dispatcher for it — but showing it
 * invites arithmetic about other people's tiers, and a number that moves
 * because somebody upstream cancelled reads as a bug rather than as luck.
 * "In queue" is the honest amount to promise.
 *
 * Free and Go are told upgrading moves them up, because for them it is
 * true and actionable. Pro and Exclusive are already at the front of the
 * ratio, so telling them the same thing would be selling something that
 * does not exist.
 */
export function describeQueue(view: QueueView, tier?: Tier): string {
  if (!view.waiting) return "";
  const eta =
    view.etaSeconds && view.etaSeconds > 0
      ? ` — about ${formatWait(view.etaSeconds)}`
      : "";
  return `Response in queue${eta}`;
}

/** The upgrade nudge, or "" for plans that are already prioritised. */
export function queueUpgradeHint(tier?: Tier): string {
  return tier === "free" || tier === "go"
    ? "Consider upgrading for a shorter wait."
    : "";
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${Math.max(5, Math.round(seconds / 5) * 5)}s`;
  const mins = Math.round(seconds / 60);
  return `${mins} min${mins === 1 ? "" : "s"}`;
}
