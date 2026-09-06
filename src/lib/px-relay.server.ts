/**
 * Same-origin asset relay ("unblock mode").
 *
 * Plenty of school and office networks block the game provider's domains
 * outright, which leaves players with dead thumbnails and a blank frame even
 * though our own site loads fine. This helper fetches provider content
 * server-side and serves it from our own origin, so the network only ever
 * sees a request to our domain.
 *
 * URL shape is path-based on purpose:
 *
 *   <prefix>/https/play.gamepix.com/some-game/embed?sid=1
 *
 * so relative URLs inside the fetched page keep resolving through the relay.
 * Root-relative and absolute URLs are handled by rewriting the text of
 * HTML/CSS/JS responses, plus a small shim script that patches fetch / XHR /
 * element sources for URLs built at runtime.
 *
 * Two prefixes exist:
 *   /api/public/px            — plain assets (thumbnails, scripts)
 *   /<game-slug>/px           — game frames, where the provider's own player
 *                               derives the game name from the first path
 *                               segment of location.pathname.
 *
 * This is NOT an open proxy: only an explicit allow-list of provider and
 * common game-CDN hosts can be fetched, and only GET/HEAD/POST.
 */

/** Hosts (and their subdomains) the relay is willing to fetch. */
const ALLOWED_SUFFIXES = [
  "gamepix.com",
  "gamepix.net",
  "gpcdn.net",
  "jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "ajax.googleapis.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "code.createjs.com",
  "cdn.babylonjs.com",
  "howlerjs.com",
];

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase().split(":")[0] ?? "";
  return ALLOWED_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

function relayPath(prefix: string, scheme: string, host: string, rest = ""): string {
  return `${prefix}/${scheme}/${host}${rest}`;
}

/** Rewrite absolute + protocol-relative URLs in text bodies to relay paths. */
function rewriteText(body: string, prefix: string): string {
  const escaped = prefix.replace(/\//g, "\\/");
  return body
    .replace(/https?:\\\/\\\/([a-zA-Z0-9.-]+)/g, (m, host: string) =>
      hostAllowed(host)
        ? `${escaped}\\/${m.startsWith("https") ? "https" : "http"}\\/${host}`
        : m,
    )
    .replace(/(https?):\/\/([a-zA-Z0-9.-]+)/g, (m, scheme: string, host: string) =>
      hostAllowed(host) ? relayPath(prefix, scheme, host) : m,
    )
    .replace(/(["'(=\s])\/\/([a-zA-Z0-9.-]+)\//g, (m, lead: string, host: string) =>
      hostAllowed(host) ? `${lead}${relayPath(prefix, "https", host)}/` : m,
    );
}

/**
 * Injected into relayed HTML documents. Anything the game builds at runtime
 * (a fetch of "/assets/data.json", an Image whose src is concatenated) gets
 * pushed back through the relay instead of straight at the blocked host.
 */
function shim(prefix: string, scheme: string, host: string): string {
  return `<script>(function(){
var P=${JSON.stringify(prefix)},B=${JSON.stringify(relayPath(prefix, scheme, host))},H=${JSON.stringify(ALLOWED_SUFFIXES)};
function ok(h){h=(h||"").toLowerCase().split(":")[0];return H.some(function(s){return h===s||h.endsWith("."+s)})}
function fix(u){
  try{
    if(u==null)return u;
    if(typeof u!=="string"){if(u&&u.url)u=u.url;else return u}
    if(u.indexOf(P)===0||u.indexOf("data:")===0||u.indexOf("blob:")===0||u.indexOf("javascript:")===0)return u;
    var m=/^(https?):\\/\\/([^/?#]+)(.*)$/i.exec(u);
    if(m)return ok(m[2])?P+"/"+m[1].toLowerCase()+"/"+m[2]+m[3]:u;
    if(u.indexOf("//")===0){var n=u.slice(2).split(/[/?#]/)[0];return ok(n)?P+"/https/"+u.slice(2):u}
    if(u.charAt(0)==="/")return B+u;
    return u;
  }catch(e){return u}
}
window.__dapRelay=fix;
var f=window.fetch;
if(f)window.fetch=function(i,o){try{if(typeof i==="string"||i instanceof URL)i=fix(String(i));else if(i&&i.url)i=new Request(fix(i.url),i)}catch(e){}return f.call(this,i,o)};
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);a[1]=fix(String(u));return xo.apply(this,a)};
[[window.HTMLImageElement,"src"],[window.HTMLScriptElement,"src"],[window.HTMLMediaElement,"src"],[window.HTMLSourceElement,"src"],[window.HTMLIFrameElement,"src"],[window.HTMLLinkElement,"href"]].forEach(function(p){
  var C=p[0];if(!C)return;var d=Object.getOwnPropertyDescriptor(C.prototype,p[1]);if(!d||!d.set)return;
  Object.defineProperty(C.prototype,p[1],{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){d.set.call(this,fix(String(v)))}});
});
var sa=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(n,v){if(/^(src|href|data-src|poster)$/i.test(n))v=fix(String(v));return sa.call(this,n,v)};
if(window.Worker){var W=window.Worker;window.Worker=function(u,o){return new W(fix(String(u)),o)};window.Worker.prototype=W.prototype}
})();</script>`;
}

function isTextual(contentType: string): "html" | "text" | null {
  const t = contentType.toLowerCase();
  if (t.includes("text/html") || t.includes("application/xhtml")) return "html";
  if (
    t.includes("javascript") ||
    t.includes("text/css") ||
    t.includes("json") ||
    t.includes("text/plain") ||
    t.includes("xml")
  ) {
    return "text";
  }
  return null;
}

export async function handleRelay(
  request: Request,
  splat: string,
  method: "GET" | "HEAD" | "POST",
  prefix: string,
): Promise<Response> {
  const parts = splat.replace(/^\/+/, "").split("/");
  const scheme = (parts.shift() ?? "").toLowerCase();
  const host = parts.shift() ?? "";
  if ((scheme !== "http" && scheme !== "https") || !host) {
    return new Response("Bad relay target", { status: 400 });
  }
  if (!hostAllowed(host)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const search = new URL(request.url).search;
  const target = `${scheme}://${host}/${parts.join("/")}${search}`;

  const headers: Record<string, string> = {
    accept: request.headers.get("accept") ?? "*/*",
    "accept-language": request.headers.get("accept-language") ?? "en",
    "user-agent":
      request.headers.get("user-agent") ??
      "Mozilla/5.0 (compatible; DAPGames relay)",
    referer: `${scheme}://${host}/`,
  };
  const range = request.headers.get("range");
  if (range) headers["range"] = range;
  const reqType = request.headers.get("content-type");
  if (method === "POST" && reqType) headers["content-type"] = reqType;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      redirect: "follow",
      ...(method === "POST" ? { body: await request.arrayBuffer() } : {}),
    });
  } catch (e) {
    console.error("[relay] fetch failed:", target, e instanceof Error ? e.message : e);
    return new Response("Relay upstream unreachable", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const out = new Headers();
  out.set("content-type", contentType);
  out.set(
    "cache-control",
    upstream.headers.get("cache-control") ?? "public, max-age=3600",
  );
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) out.set("accept-ranges", acceptRanges);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) out.set("content-range", contentRange);
  // Deliberately dropped: x-frame-options / content-security-policy /
  // cross-origin-*-policy, which would otherwise stop the relayed page from
  // rendering inside our player frame.

  if (method === "HEAD" || !upstream.ok) {
    return new Response(method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: out,
    });
  }

  const kind = isTextual(contentType);
  if (!kind) {
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }

  let text = rewriteText(await upstream.text(), prefix);
  if (kind === "html") {
    const base = `<base href="${relayPath(
      prefix,
      scheme,
      host,
      `/${parts.join("/")}`,
    ).replace(/[^/]*$/, "")}">`;
    const inject = `${base}${shim(prefix, scheme, host)}`;
    text = /<head[^>]*>/i.test(text)
      ? text.replace(/<head[^>]*>/i, (m) => `${m}${inject}`)
      : `${inject}${text}`;
  }
  return new Response(text, { status: upstream.status, headers: out });
}
