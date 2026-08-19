/**
 * Security response headers, applied to every response at the edge.
 *
 * These are defence-in-depth: they do not replace input validation or RLS,
 * they narrow what a successful injection or a hostile embedder can do.
 * Chosen to be strong without breaking this specific app, because a header
 * that breaks the site gets removed and protects nothing.
 *
 * What is deliberately NOT here, and why:
 *
 *   A full script-src / connect-src CSP. TanStack Start hydrates from an
 *   inline bootstrap script, so a script-src without 'unsafe-inline' needs a
 *   per-request nonce threaded through the framework's HTML emission, which
 *   it does not expose. 'unsafe-inline' would keep the header while throwing
 *   away most of its value. The frame-ancestors directive below is the part
 *   of CSP that is both high-value and safe to ship now; a nonce-based
 *   script policy is a separate, larger piece of work.
 *
 *   X-Frame-Options. frame-ancestors supersedes it and is strictly more
 *   expressive — X-Frame-Options can only say DENY or SAMEORIGIN, and
 *   SAMEORIGIN would break the Lovable editor's cross-origin preview iframe.
 */

// Clickjacking protection that still lets the Lovable editor frame the
// preview and production deployments, and nobody else.
// The parts of CSP that are safe to ship without a script nonce and still
// worth having: forbid plugin content, stop a injected <base> from
// re-pointing relative script URLs, and keep form posts same-origin.
// frame-ancestors is the clickjacking control, scoped so the Lovable editor
// can still frame the preview and production deployments.
// Deliberately NO default-src. default-src is the fallback for script-src,
// style-src, connect-src, img-src and font-src, so setting it to 'self'
// without also enumerating those would block the Supabase connection, the
// inline hydration script, and inline styles — i.e. break the app. Each
// directive here stands alone and constrains only what it names:
//   object-src 'none'  — no <object>/<embed> plugin content (none is used)
//   base-uri 'self'    — an injected <base> cannot re-point relative URLs
//   form-action 'self' — forms can only post same-origin
//   frame-ancestors    — clickjacking control, scoped so the Lovable editor
//                        can still frame the preview and production apps
const CSP = [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://lovable.dev",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  // Never let the browser second-guess a declared Content-Type — the classic
  // route to "uploaded .txt executes as HTML/JS".
  "X-Content-Type-Options": "nosniff",
  // Send only the origin to other sites; full URL stays same-origin.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // The app uses none of these; deny them outright. Fullscreen (games) and
  // clipboard (copy buttons) are intentionally omitted, so they keep their
  // default same-origin allowance.
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  // Force HTTPS for a year. The site is only ever served over TLS by the
  // host; no `preload` — that is a semi-permanent, owner-level commitment.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": CSP,
};

/**
 * Return a response carrying the security headers, without disturbing the
 * body. Rebuilding around `response.body` keeps streaming responses (the SSE
 * chat stream) intact — the ReadableStream is handed over by reference, not
 * read here. Existing headers win: this never clobbers a Content-Type,
 * Set-Cookie, or a header a handler set on purpose.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
