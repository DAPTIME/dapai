/**
 * Per-IP rate limiting for outbound account emails.
 * One IP address may trigger at most 3 emails per 5 minutes.
 *
 * Admins can allowlist specific addresses (see the Admin Console → Emails
 * tab); those recipients are never blocked, no matter how many requests
 * come from the network.
 */
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";

export const EMAIL_WINDOW_MS = 5 * 60 * 1000;
export const EMAIL_MAX_PER_WINDOW = 3;

export function requestIp() {
  const ip =
    getRequestIP({ xForwardedFor: true }) ||
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-real-ip") ||
    "unknown";
  return ip.split(",")[0]!.trim();
}

/** True when an admin has allowlisted this address from rate limiting. */
export async function isEmailExempt(email?: string | null) {
  if (!email) return false;
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin
      .from("email_rate_limit_exempt")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    if (error) {
      console.error("[rate-limit] exemption lookup failed:", error.message);
      return false;
    }
    return !!data;
  } catch (e) {
    console.error("[rate-limit] exemption lookup threw:", (e as Error).message);
    return false;
  }
}

/**
 * Throws a friendly error when the caller's IP has already sent the maximum
 * number of emails in the current window. Records the send when allowed.
 * Allowlisted recipient addresses skip the check entirely.
 */
export async function consumeEmailQuota(kind = "email", email?: string | null) {
  if (await isEmailExempt(email)) return;

  const ip = requestIp();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - EMAIL_WINDOW_MS).toISOString();

  const { count, error } = await supabaseAdmin
    .from("email_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .not("kind", "like", "attempt:%")
    .gte("created_at", since);


  if (error) {
    console.error("[rate-limit] lookup failed:", error.message);
  } else if ((count ?? 0) >= EMAIL_MAX_PER_WINDOW) {
    throw new Error(
      "Too many emails requested from this network. Please wait 5 minutes and try again."
    );
  }

  await supabaseAdmin.from("email_rate_limits").insert({ ip, kind });

  // Opportunistic cleanup of old rows.
  await supabaseAdmin
    .from("email_rate_limits")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
}
