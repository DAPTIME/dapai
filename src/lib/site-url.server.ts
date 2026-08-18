/**
 * Canonical public site URL for links we put inside emails.
 *
 * Never trust a browser-supplied origin blindly: in local development it is
 * http://localhost:8080, which is useless in an email. We only accept a client
 * origin when it is a real, non-local https host; otherwise we fall back to the
 * configured public site URL.
 */

const DEFAULT_SITE_URL = "https://dapai.lovable.app";

/**
 * Hosts we are willing to put inside an email link. A client-supplied origin is
 * only honoured when it matches this allow-list, so a caller cannot make our
 * own reset/confirmation emails point at a domain they control.
 */
const ALLOWED_HOSTS = new Set([
  "dapai.lovable.app",
  "dapai.dpdns.org",
  "project--4e5794db-69e7-4998-9ede-a9b885182642.lovable.app",
  "project--4e5794db-69e7-4998-9ede-a9b885182642-dev.lovable.app",
  "id-preview--4e5794db-69e7-4998-9ede-a9b885182642.lovable.app",
]);

function isAllowedHost(hostname: string) {
  return ALLOWED_HOSTS.has(hostname.toLowerCase());
}

function clean(url: string | undefined | null, requireAllowList: boolean): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (requireAllowList && (u.protocol !== "https:" || !isAllowedHost(u.hostname))) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Returns the origin email links should point at.
 * Priority: server-configured secret -> allow-listed client origin -> canonical default.
 * An unknown client origin is ignored entirely.
 */
export function resolveSiteUrl(clientOrigin?: string | null): string {
  return (
    clean(process.env["PUBLIC_SITE_URL"], false) ||
    clean(process.env["SITE_URL"], false) ||
    clean(clientOrigin, true) ||
    DEFAULT_SITE_URL
  );
}

