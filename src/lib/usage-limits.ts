/**
 * Per-plan allowances, in one place.
 *
 * These numbers were scattered across the modules that happened to need
 * them — the chat-history cap lived as a private const in
 * chats.functions.ts, so nothing could show a user what it was. Anything
 * that limits an account by plan belongs here, and the account page reads
 * from it so the figure a person is shown is the figure that is enforced.
 *
 * The message/token allowance is deliberately absent: pro_messages_used is
 * counted today but never checked, so there is no limit to state yet. When
 * that lands it goes here, and getMyUsage() surfaces it.
 */
import type { Tier } from "@/lib/tier-rank";

/**
 * How many chats stay in history. Older ones are pruned on the next new
 * chat, so this is a rolling window rather than a hard stop.
 */
export const CHAT_HISTORY_LIMIT: Record<Tier, number> = {
  free: 5,
  go: 10,
  pro: 25,
  exclusive: 100,
};
