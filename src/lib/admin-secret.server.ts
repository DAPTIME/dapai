/**
 * The shared secret that has to be present for anything on the site to be
 * changed.
 *
 * ── What this is, and what it is not ────────────────────────────────────
 *
 * Every write in the admin console already requires the caller to be a site
 * admin. This adds a second, independent condition: the deployment serving
 * the request must hold `dap_admin_panel`. Both must hold, so the console
 * refuses a change if either one fails.
 *
 * The property it buys is about *where* a change comes from, not who makes
 * it. A copy of this code running somewhere else — a fork, a preview build,
 * a machine someone pointed at the same database — cannot change site
 * settings even with a genuine admin account signed in, because it does not
 * have the secret. And rotating the secret withdraws that ability from
 * every deployment at once, without touching a single account.
 *
 * ── Why the browser never sees it ───────────────────────────────────────
 *
 * The obvious reading of "the admin page sends the secret with each
 * request" is that the page holds it. It cannot: anything shipped to a
 * browser is in the JS bundle and in the network tab, readable by anyone
 * who opens the console, any extension with page access, and anyone sharing
 * the machine. A secret that every admin's browser carries is a secret in
 * name only, and it would be strictly worse than the admin check that is
 * already there.
 *
 * So the check lives on the server. The admin page calls a server function;
 * the server function is what carries the secret and what refuses without
 * it. From the page's side the behaviour is what was asked for — a request
 * that lacks the secret changes nothing — while the value itself never
 * leaves the server.
 */

/** Reads the secret fresh each time, so rotating it does not need a redeploy. */
function configuredSecret(): string {
  // Read both spellings: it was described first as DAP_Admin and then as
  // dap_admin_panel, and environment variable names are case sensitive on
  // Linux. Accepting either means a misremembered name fails loudly at
  // configuration time rather than silently locking the console.
  return (
    process.env.dap_admin_panel ??
    process.env.DAP_ADMIN_PANEL ??
    process.env.DAP_Admin ??
    ""
  ).trim();
}

/** True when this deployment is able to authorise changes at all. */
export function hasAdminSecret(): boolean {
  return configuredSecret().length > 0;
}

/**
 * Compare in constant time. A plain === returns on the first wrong
 * character, which hands out the secret a byte at a time to anyone timing
 * the response.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Refuse a change when this deployment has a secret and the request cannot
 * satisfy it.
 *
 * ── Why an absent secret allows the write ───────────────────────────────
 *
 * The first version of this threw whenever dap_admin_panel was unset. That
 * turns one missing environment variable into a console where nothing can
 * be saved — every user edit, every tier change, every feature toggle — and
 * the only way back is to redeploy. For a check whose whole purpose is to
 * be a second lock behind an admin login, that trade is wrong: if there is
 * no secret configured, there is no secret to verify, so refusing every
 * write buys nothing at all and costs the site its controls.
 *
 * Anyone who can set environment variables on the deployment already owns
 * the deployment, so "attacker unsets the secret" is not a threat this
 * could have stopped either way.
 *
 * So: secret present, it is enforced exactly as asked. Secret absent, the
 * write proceeds on the admin check alone and the server logs loudly, once
 * per process, so the gap is visible in the logs rather than silent.
 */
let warned = false;

export function assertAdminSecret(): void {
  if (hasAdminSecret()) return;

  if (!warned) {
    warned = true;
    console.warn(
      "[admin] dap_admin_panel is not set on this deployment, so site changes " +
        "are protected by the admin check alone. Set it to require the shared " +
        "secret as well."
    );
  }
}

/**
 * For a request that carries the secret explicitly — a webhook, a script, or
 * anything that is not a signed-in admin in the console. Unused by the
 * console itself, which authenticates its caller instead.
 */
export function secretMatches(offered: string | null | undefined): boolean {
  const secret = configuredSecret();
  if (!secret) return false;
  return safeEqual((offered ?? "").trim(), secret);
}
