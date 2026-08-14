/**
 * Per-IP rate limiting for outbound account emails.
 * One IP address may trigger at most 3 emails per 5 minutes.
 *
 * The limit applies consistently to every recipient. There is deliberately
 * no bypass list: account-email protection should be predictable.
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

/**
 * Throws a friendly error when the caller's IP has already sent the maximum
 * number of emails in the current window. Records the send when allowed.
 */
export async function consumeEmailQuota(kind = "email", _email?: string | null) {
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
