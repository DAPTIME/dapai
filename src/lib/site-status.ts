/**
 * Whether the site is open, and to whom.
 *
 * Three states rather than two, stored in the same ai_settings row that
 * held "on"/"off" before:
 *
 *   on      everyone can use the site
 *   admin   only site admins can; everyone else sees the offline message
 *   off     nobody can, admins included
 *
 * "admin" is the state that was missing. Turning the site off to make a
 * change also locked out the person making it, so the only way to test
 * anything was to leave it open to everybody while it was half-broken.
 *
 * Shared between client and server deliberately: the composer, the chat
 * server functions and the streaming endpoint all have to agree on what a
 * stored value means, and three copies of a string comparison is how they
 * stop agreeing.
 */
export const SITE_STATUSES = ["on", "admin", "off"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  on: "On",
  admin: "Admin panel",
  off: "Off",
};

export const SITE_STATUS_DESCRIPTIONS: Record<SiteStatus, string> = {
  on: "Everyone can use the site.",
  admin: "Only site admins can use it. Everyone else sees the offline message.",
  off: "Nobody can use it, including you.",
};

/**
 * Read a stored value.
 *
 * Anything unrecognised reads as "on". The rows are hand-editable from the
 * Supabase table editor, and a typo there should not take the site down —
 * the same fail-open rule the previous two-state check used, where only the
 * exact string "off" closed it.
 */
export function parseSiteStatus(raw: string | null | undefined): SiteStatus {
  const v = (raw ?? "on").trim().toLowerCase();
  return (SITE_STATUSES as readonly string[]).includes(v)
    ? (v as SiteStatus)
    : "on";
}

/** Whether a given viewer may use the site right now. */
export function siteOpenTo(status: SiteStatus, isAdmin: boolean): boolean {
  if (status === "on") return true;
  if (status === "admin") return isAdmin;
  return false;
}
