import { createFileRoute } from "@tanstack/react-router";

/**
 * Server relay for DAP AI.
 *
 * Set AI_BACKEND_URL (and optional AI_BACKEND_KEY) as a secret.
 * Point it at your PC via a tunnel (ngrok / cloudflared / tailscale funnel).
 *
 * Rate limit: 5 words per second per client IP (token bucket), so a flood
 * of users can't overwhelm the local GPU.
 */

const RATE_WORDS_PER_SEC = 5;
const BUCKET_CAPACITY = 5; // burst allowance, in words

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

function takeTokens(ip: string, cost: number): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: BUCKET_CAPACITY, updated: now };
  // Refill
  const elapsedSec = (now - b.updated) / 1000;
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + elapsedSec * RATE_WORDS_PER_SEC);
  b.updated = now;

  if (b.tokens >= cost) {
    b.tokens -= cost;
    buckets.set(ip, b);
    return { ok: true };
  }
  const deficit = cost - b.tokens;
  const retryAfter = Math.ceil(deficit / RATE_WORDS_PER_SEC);
  buckets.set(ip, b);
  return { ok: false, retryAfter };
}

function countWords(s: unknown): number {
  if (typeof s !== "string") return 0;
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "unknown"
  );
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const backend = process.env.AI_BACKEND_URL;
        if (!backend) {
          return Response.json(
            {
              error:
                "No AI backend configured. Set AI_BACKEND_URL to your PC's tunnel URL.",
            },
            { status: 503 }
          );
        }

        const raw = await request.text();

        // Word-count the latest user message for rate-limiting.
        let cost = 1;
        try {
          const parsed = JSON.parse(raw) as {
            messages?: { role?: string; content?: string }[];
          };
          const lastUser = [...(parsed.messages ?? [])]
            .reverse()
            .find((m) => m.role === "user");
          cost = Math.max(1, countWords(lastUser?.content));
        } catch {
          // Malformed body — let upstream return the error.
        }

        const ip = clientIp(request);
        const gate = takeTokens(ip, cost);
        if (!gate.ok) {
          return Response.json(
            {
              error: `Rate limit: max ${RATE_WORDS_PER_SEC} words/sec per user. Try again in ${gate.retryAfter}s.`,
            },
            {
              status: 429,
              headers: { "Retry-After": String(gate.retryAfter) },
            }
          );
        }

        const key = process.env.AI_BACKEND_KEY;
        try {
          const res = await fetch(backend, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
            },
            body: raw,
          });
          const text = await res.text();
          return new Response(text, {
            status: res.status,
            headers: {
              "Content-Type":
                res.headers.get("content-type") ?? "application/json",
            },
          });
        } catch (e) {
          return Response.json(
            { error: `Could not reach AI_BACKEND_URL: ${(e as Error).message}` },
            { status: 502 }
          );
        }
      },
    },
  },
});
