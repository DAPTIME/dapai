import { createFileRoute } from "@tanstack/react-router";
import { enqueue } from "@/lib/ai-queue";
import { sanitizeLiteReply } from "@/lib/lite-sanitize";

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

        const { url: backend, key, upstreamModel } = backendFor(model);
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

        // Rewrite outgoing body's `model` to the upstream identifier
        // (e.g. LM Studio's loaded-model name) if configured.
        let outgoingBody = raw;
        try {
          const parsed = JSON.parse(raw);
          if (upstreamModel) parsed.model = upstreamModel;
          if (model === "dap-ai-lite") {
            parsed.reasoning_effort = "none";
            parsed.thinking = false;
            parsed.enable_thinking = false;
            parsed.include_reasoning = false;
            parsed.return_reasoning = false;
            parsed.temperature = 0;
            parsed.top_p = 1;
            parsed.chat_template_kwargs = {
              ...(parsed.chat_template_kwargs ?? {}),
              enable_thinking: false,
              thinking: false,
              no_think: true,
            };
            parsed.messages = [
              {
                role: "system",
                content:
                  "You are DAP AI Lite, a concise helpful assistant. Always answer correctly and directly. Do not show reasoning, planning, scratchpad, or <think> tags — just give the final answer.",
              },
              ...(Array.isArray(parsed.messages) ? parsed.messages : []),
            ];
          }

          outgoingBody = JSON.stringify(parsed);
        } catch {
          /* keep raw */
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
              body: outgoingBody,
            });
            let text = await res.text();
            if (model === "dap-ai-lite") {
              try {
                const json = JSON.parse(text);
                const content = json?.choices?.[0]?.message?.content ?? json?.message?.content;
                if (typeof content === "string") {
                  const cleaned = sanitizeLiteReply(content);
                  if (json?.choices?.[0]?.message) json.choices[0].message.content = cleaned;
                  else if (json?.message) json.message.content = cleaned;
                  text = JSON.stringify(json);
                }
              } catch {
                text = sanitizeLiteReply(text);
              }
            }
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
