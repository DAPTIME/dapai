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
  // Fail open when the deployment has no service-role key. That is this
  // module's stated philosophy for a broken table, and a missing key is the
  // same situation one layer down — before this, the client's constructor
  // threw and the "limiter" took signup down with an environment dump.
  const { tryAdminClient } = await import("./admin-client.server");
  const supabaseAdmin = await tryAdminClient();
  if (!supabaseAdmin) return;
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

/**
 * A per-IP limit on anything, counted in the same table.
 *
 * Returns whether the caller may proceed rather than throwing, because the
 * callers are HTTP handlers that need to choose their own status code.
 *
 * The kind must start with `attempt:` — `consumeEmailQuota` deliberately
 * excludes that prefix from its own count, so limiting something here can
 * never quietly eat somebody's password-reset allowance.
 *
 * Fails open. If the table cannot be read the request is allowed through:
 * a rate limiter that takes the feature down when the database hiccups has
 * done more damage than the abuse it was guarding against.
 */
export async function consumeIpQuota(
  kind: `attempt:${string}`,
  max: number,
  windowMs: number
): Promise<boolean> {
  const ip = requestIp();
  const { tryAdminClient } = await import("./admin-client.server");
  const supabaseAdmin = await tryAdminClient();
  if (!supabaseAdmin) return true; // fail open, as documented above
  const since = new Date(Date.now() - windowMs).toISOString();

  const { count, error } = await supabaseAdmin
    .from("email_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("kind", kind)
    .gte("created_at", since);

  if (error) {
    console.error("[rate-limit] lookup failed:", error.code, error.message);
    return true;
  }
  if ((count ?? 0) >= max) return false;

  await supabaseAdmin.from("email_rate_limits").insert({ ip, kind });
  return true;
}
