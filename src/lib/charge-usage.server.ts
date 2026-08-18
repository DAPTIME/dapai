/**
 * Charging a request against the caller's allowance, in one place.
 *
 * The chat route grew its own copy of this and the raw relay grew another,
 * which is how study rooms and flashcards ended up reaching the model for
 * free: they are AI features that nobody remembered to wire a third copy
 * into. Every path that dials the orchestrator should call this, so adding
 * a feature does not mean re-deriving the rule.
 *
 * Must be called with a client carrying the caller's own JWT. charge_usage
 * keys on auth.uid(), so the service-role client would spend nobody's
 * allowance and quietly succeed.
 */
import {
  PROMPT_TOO_LONG_MESSAGE,
  costOfPrompt,
  estimateTokens,
  isLedgerMissing,
  limitRefusal,
  type ChargeResult,
} from "@/lib/usage-limits";
import type { Tier } from "@/lib/tier-rank";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dbError } from "./db-error";

/** A client carrying the caller's own JWT — not the service-role one. */
type CallerClient = SupabaseClient<Database>;

export type Charged = {
  /** Usage tokens taken. Zero on Exclusive, and when no ledger is installed. */
  cost: number;
  images: number;
};

/**
 * Take the cost of this prompt, or throw a message meant to be shown.
 *
 * Charged before the model is called, because a reply that arrives after
 * the allowance ran out is a reply we gave away. The length check comes
 * first and costs nothing: an over-long prompt is refused rather than
 * billed at the top band and then rejected.
 */
export async function chargeForPrompt(
  supabase: CallerClient,
  tier: Tier,
  text: string,
  images = 0
): Promise<Charged> {
  const cost = costOfPrompt(tier, estimateTokens(text));
  if (cost === null) throw new Error(PROMPT_TOO_LONG_MESSAGE);

  const wantImages = Math.min(images, 1);
  const { data: charged, error } = await supabase
    .rpc("charge_usage", { _cost: cost, _images: wantImages })
    .maybeSingle();

  if (error) {
    // No ledger installed yet means no limit configured, not a limit
    // reached. Anything else fails closed.
    if (!isLedgerMissing(error)) throw dbError(error, "charge_usage");
    console.warn("[usage] charge_usage missing — not counting this request");
    return { cost: 0, images: 0 };
  }
  if (charged && charged.ok === false) {
    throw new Error(limitRefusal(charged as ChargeResult, tier));
  }
  return { cost, images: wantImages };
}

/**
 * Give back a charge for a request that produced nothing.
 *
 * Goes through the service-role client, not the caller's. The client-facing
 * refund_usage took the amount as an argument and subtracted it from
 * whoever was calling, so holding that grant meant a signed-in account
 * could loop it and keep its quota at zero. The grant is gone; refunds now
 * name the user explicitly and are reachable only from the server, which
 * passes back the amount it charged moments earlier.
 *
 * Best effort and never fatal — a failed refund must not turn an outage
 * into a second error stacked on top of it. Safety refusals and stopped
 * replies are not refunded: both were served.
 */
export async function refundPrompt(
  userId: string,
  charged: Charged
): Promise<void> {
  if (charged.cost <= 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("admin_refund_usage", {
    _user_id: userId,
    _cost: charged.cost,
    _images: charged.images,
  });
  if (error && !isLedgerMissing(error)) {
    console.error(`[usage] refund failed: ${error.message}`);
  }
}
