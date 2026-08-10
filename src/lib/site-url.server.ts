/**
 * Canonical public site URL for links we put inside emails.
 *
 * Never trust a browser-supplied origin blindly: in local development it is
 * http://localhost:8080, which is useless in an email. We only accept a client
 * origin when it is a real, non-local https host; otherwise we fall back to the
 * configured public site URL.
 */

const DEFAULT_SITE_URL = "https://dapai.lovable.app";

function isLocal(host: string) {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".local")
  );
}

function clean(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (isLocal(u.hostname)) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Returns the origin email links should point at.
 * Priority: configured secret -> safe client origin -> canonical default.
 */
export function resolveSiteUrl(clientOrigin?: string | null): string {
  return (
    clean(process.env["PUBLIC_SITE_URL"]) ||
    clean(process.env["SITE_URL"]) ||
    clean(clientOrigin) ||
    DEFAULT_SITE_URL
  );
}
