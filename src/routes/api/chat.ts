import { createFileRoute } from "@tanstack/react-router";
import { enqueue } from "@/lib/ai-queue";

/**
 * Raw HTTP relay for DAP AI (optional — the main app uses the
 * sendChatMessage server fn). Picks the backend based on the `model`
 * field in the body, then serializes calls per-model so the local GPU
 * doesn't get hit twice at once.
 *
 *   model: "dap-ai-1.0"  → AI_BACKEND_URL_PRO  / AI_BACKEND_KEY_PRO
 *   model: "dap-ai-lite" → AI_BACKEND_URL_LITE / AI_BACKEND_KEY_LITE
 *   (falls back to AI_BACKEND_URL / AI_BACKEND_KEY if not set)
 *
 * Rate limit: 5 words per second per client IP (token bucket).
 */

const RATE_WORDS_PER_SEC = 5;
const BUCKET_CAPACITY = 5;

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

function takeTokens(
  ip: string,
  cost: number
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: BUCKET_CAPACITY, updated: now };
  const elapsedSec = (now - b.updated) / 1000;
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + elapsedSec * RATE_WORDS_PER_SEC);
  b.updated = now;
  if (b.tokens >= cost) {
    b.tokens -= cost;
    buckets.set(ip, b);
    return { ok: true };
  }
  const retryAfter = Math.ceil((cost - b.tokens) / RATE_WORDS_PER_SEC);
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

function backendFor(model: string): { url?: string; key?: string; upstreamModel?: string } {
  if (model === "dap-ai-lite") {
    return {
      url: process.env.AI_BACKEND_URL_LITE ?? process.env.AI_BACKEND_URL,
      key: process.env.AI_BACKEND_KEY_LITE ?? process.env.AI_BACKEND_KEY,
      upstreamModel: process.env.AI_BACKEND_MODEL_LITE,
    };
  }
  return {
    url: process.env.AI_BACKEND_URL_PRO ?? process.env.AI_BACKEND_URL,
    key: process.env.AI_BACKEND_KEY_PRO ?? process.env.AI_BACKEND_KEY,
    upstreamModel: process.env.AI_BACKEND_MODEL_PRO,
  };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();

        let model = "dap-ai-1.0";
        let cost = 1;
        try {
          const parsed = JSON.parse(raw) as {
            model?: string;
            messages?: { role?: string; content?: string }[];
          };
          if (parsed.model === "dap-ai-lite") model = "dap-ai-lite";
          const lastUser = [...(parsed.messages ?? [])]
            .reverse()
            .find((m) => m.role === "user");
          cost = Math.max(1, countWords(lastUser?.content));
        } catch {
          /* upstream will surface the parse error */
        }

        const { url: backend, key } = backendFor(model);
        if (!backend) {
          return Response.json(
            {
              error: `No backend configured for ${model}. Set ${
                model === "dap-ai-lite"
                  ? "AI_BACKEND_URL_LITE"
                  : "AI_BACKEND_URL_PRO"
              }.`,
            },
            { status: 503 }
          );
        }

        const ip = clientIp(request);
        const gate = takeTokens(ip, cost);
        if (!gate.ok) {
          return Response.json(
            {
              error: `Rate limit: max ${RATE_WORDS_PER_SEC} words/sec per user. Try again in ${gate.retryAfter}s.`,
            },
            { status: 429, headers: { "Retry-After": String(gate.retryAfter) } }
          );
        }

        // Per-model queue: one request at a time per model.
        return enqueue(`model:${model}`, async () => {
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
              { error: `Could not reach backend: ${(e as Error).message}` },
              { status: 502 }
            );
          }
        });
      },
    },
  },
});
