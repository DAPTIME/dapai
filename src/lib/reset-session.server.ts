/**
 * Short-lived password-reset sessions. A reset must be completed within
 * RESET_TTL_MS of looking up the recovery question, and each ticket is
 * single-use.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const RESET_TTL_MS = 10 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createResetSession(email: string, ip: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const token = randomBytes(32).toString("hex");
  const { error } = await supabaseAdmin.from("password_reset_sessions").insert({
    email,
    token_hash: hashToken(token),
    ip,
    expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { token, expiresInMs: RESET_TTL_MS };
}

/** Validates and consumes a reset ticket for the given email. */
export async function consumeResetSession(email: string, token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("password_reset_sessions")
    .select("id, email, expires_at, used_at, token_hash")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  const expired =
    !row ||
    row.used_at ||
    row.email !== email ||
    new Date(row.expires_at).getTime() < Date.now();

  if (expired) {
    throw new Error(
      "This password reset session has expired. Please start again — resets must be completed within 10 minutes."
    );
  }

  // Constant-time confirmation of the stored hash.
  const a = Buffer.from(row.token_hash, "hex");
  const b = Buffer.from(hashToken(token), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid password reset session.");
  }

  await supabaseAdmin
    .from("password_reset_sessions")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id);

  // Housekeeping: drop stale tickets.
  await supabaseAdmin
    .from("password_reset_sessions")
    .delete()
    .lt("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  return true;
}
