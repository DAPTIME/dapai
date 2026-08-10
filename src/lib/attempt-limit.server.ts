/**
 * Generic per-IP attempt throttling for sensitive account actions
 * (recovery-answer guesses, password resets, sign-in helpers).
 *
 * Reuses the email_rate_limits table with an `attempt:<name>` kind so that
 * brute-force guessing gets locked out quickly, without interfering with
 * the outbound-email quota.
 */
import { requestIp } from "./rate-limit.server";

export interface AttemptPolicy {
  /** Distinct name for the action being throttled. */
  name: string;
  /** Maximum counted attempts allowed in the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const RECOVERY_ANSWER_POLICY: AttemptPolicy = {
  name: "recovery_answer",
  max: 5,
  windowMs: 15 * 60 * 1000,
};

export const PASSWORD_CHANGE_POLICY: AttemptPolicy = {
  name: "password_change",
  max: 8,
  windowMs: 15 * 60 * 1000,
};

function minutes(ms: number) {
  return Math.max(1, Math.round(ms / 60000));
}

/**
 * Throws when this IP has exceeded the policy. Otherwise records the attempt.
 * Call this BEFORE verifying a secret, so guesses are always counted.
 */
export async function consumeAttempt(policy: AttemptPolicy) {
  const ip = requestIp();
  const kind = `attempt:${policy.name}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - policy.windowMs).toISOString();

  const { count, error } = await supabaseAdmin
    .from("email_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("kind", kind)
    .gte("created_at", since);

  if (error) {
    console.error("[attempt-limit] lookup failed:", error.message);
  } else if ((count ?? 0) >= policy.max) {
    throw new Error(
      `Too many attempts from this network. Please wait ${minutes(
        policy.windowMs
      )} minutes and try again.`
    );
  }

  await supabaseAdmin.from("email_rate_limits").insert({ ip, kind });
}

/** Clears the counter for this IP after a successful, legitimate action. */
export async function clearAttempts(policy: AttemptPolicy) {
  try {
    const ip = requestIp();
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await supabaseAdmin
      .from("email_rate_limits")
      .delete()
      .eq("ip", ip)
      .eq("kind", `attempt:${policy.name}`);
  } catch (e) {
    console.error("[attempt-limit] clear failed:", (e as Error).message);
  }
}
