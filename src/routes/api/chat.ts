import {
  SUPABASE_URL as PUBLIC_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY as PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/supabase/public-config";
import { createFileRoute } from "@tanstack/react-router";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
import { enqueue } from "@/lib/ai-queue";
import {
  TIER_LIMITS,
  MAX_IMAGES_PER_PROMPT,
  costOfPrompt,
  estimateTokens,
  isLedgerMissing,
} from "@/lib/usage-limits";
import type { ModelId } from "@/lib/models";
import { sanitizeLiteReply } from "@/lib/lite-sanitize";

const LITE_NO_THINK_PROMPT =
  "You are DAP AI Lite, also known as the Gemma E2B model. Thinking mode is OFF. Answer with only the final user-facing response. Never write internal reasoning, planning, analysis, scratchpad, self-talk, or sentences like 'I need to'. Do not output <think> tags or explain how you will answer.";

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

/**
 * No artificial words-per-second rate limit — concurrency is bounded
 * solely by the per-model FIFO queue below (one request in flight per
 * model on the local GPU at a time). Users can submit as many words
 * as they like; they just wait their turn in line.
 */


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
        // Require an authenticated Supabase user — this relay forwards to
        // paid AI backends and must not be callable anonymously.
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        let callerId: string;
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const SUPABASE_URL = PUBLIC_SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = PUBLIC_SUPABASE_PUBLISHABLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            return Response.json({ error: "Server auth not configured" }, { status: 500 });
          }
          const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data, error } = await sb.auth.getClaims(token);
          if (error || !data?.claims?.sub) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          callerId = data.claims.sub as string;
        } catch {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const raw = await request.text();

        let model = "dap-ai-1.0";
        try {
          const parsed = JSON.parse(raw) as { model?: string };
          if (parsed.model === "dap-ai-lite") model = "dap-ai-lite";
        } catch {
          /* upstream will surface the parse error */
        }

        // Server-side tier gating + admin kill switches, matching the
        // sendChatMessage server function. Client-supplied `model` is never
        // trusted on its own.
        {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data: status } = await supabaseAdmin
            .from("ai_settings")
            .select("system_prompt")
            .eq("id", "site_status")
            .maybeSingle();
          if ((status?.system_prompt ?? "on").trim().toLowerCase() === "off") {
            return Response.json(
              { error: "DAP AI is undergoing major reworks. Please try again later." },
              { status: 503 }
            );
          }

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("tier")
            .eq("id", callerId)
            .maybeSingle();
          const callerRank = TIER_RANK[(profile?.tier as Tier) ?? "free"];
          if (model === "dap-ai-1.0" && callerRank < TIER_RANK.pro) {
            // Free/Go tiers are locked to Lite.
            model = "dap-ai-lite";
          }

          /* Usage tokens. This route reaches the model directly, so it
             needs the same charge sendChatMessage applies — otherwise it
             is a free door standing beside a locked one.

             Charged through a client carrying the caller's own JWT,
             because charge_usage keys on auth.uid(); the service-role
             client would spend nobody's allowance. */
          {
            const tier = ((profile?.tier as Tier) ?? "free") as Tier;
            const limits = TIER_LIMITS[tier];

            let promptText = "";
            let images = 0;
            try {
              const body = JSON.parse(raw) as {
                messages?: Array<{ role?: string; content?: unknown }>;
              };
              const last = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
              if (typeof last?.content === "string") {
                promptText = last.content;
              } else if (Array.isArray(last?.content)) {
                for (const part of last.content as Array<{ type?: string; text?: string }>) {
                  if (part?.type === "text" && typeof part.text === "string") promptText += part.text;
                  if (part?.type === "image_url") images += 1;
                }
              }
            } catch {
              /* an unparseable body is the backend's problem, not the ledger's */
            }

            if (images > MAX_IMAGES_PER_PROMPT) {
              return Response.json(
                { error: `Please attach at most ${MAX_IMAGES_PER_PROMPT} image per message.` },
                { status: 400 }
              );
            }
            const promptTokens = estimateTokens(promptText);
            if (promptTokens > limits.maxPromptTokens) {
              return Response.json(
                {
                  error: `That message is too long for your plan — about ${promptTokens} tokens against a ${limits.maxPromptTokens} limit.`,
                },
                { status: 400 }
              );
            }

            const cost = costOfPrompt({
              tier,
              model: model as ModelId,
              promptTokens,
              hasImage: images > 0,
            });

            const { createClient } = await import("@supabase/supabase-js");
            const asCaller = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
              auth: { persistSession: false, autoRefreshToken: false },
              global: { headers: { Authorization: `Bearer ${token}` } },
            });
            const { data: charged, error: chargeErr } = await asCaller
              .rpc("charge_usage", { _cost: cost, _images: Math.min(images, 1) })
              .maybeSingle();
            if (chargeErr && !isLedgerMissing(chargeErr)) {
              console.error("[api/chat] charge_usage failed:", chargeErr.message);
              return Response.json(
                { error: "We couldn't check your usage allowance. Please try again." },
                { status: 503 }
              );
            }
            if (chargeErr) {
              console.warn("[api/chat] charge_usage missing — not counting this message");
            }
            if (charged && (charged as { ok?: boolean }).ok === false) {
              return Response.json(
                { error: (charged as { reason?: string }).reason ?? "You have used up your allowance." },
                { status: 429 }
              );
            }
          }

          const flagId =
            model === "dap-ai-1.0" ? "feature_pro_model" : "feature_lite_model";
          const { data: flag } = await supabaseAdmin
            .from("ai_settings")
            .select("system_prompt")
            .eq("id", flagId)
            .maybeSingle();
          if ((flag?.system_prompt ?? "on").trim().toLowerCase() === "off") {
            return Response.json(
              {
                error:
                  model === "dap-ai-1.0"
                    ? "DAP AI 4 Pro is currently disabled by the admin."
                    : "DAP AI 4 Lite is currently disabled by the admin.",
              },
              { status: 503 }
            );
          }
        }



        const { url: backend, key, upstreamModel } = backendFor(model);
        if (!backend) {
          return Response.json(
            {
              error: "Sorry, DAP AI is offline right now.",
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
            parsed.extra_body = {
              ...(parsed.extra_body ?? {}),
              chat_template_kwargs: {
                ...(parsed.extra_body?.chat_template_kwargs ?? {}),
                enable_thinking: false,
                thinking: false,
                no_think: true,
              },
            };
            parsed.messages = [
              {
                role: "system",
                content: LITE_NO_THINK_PROMPT,
              },
              ...(Array.isArray(parsed.messages) ? parsed.messages : []),
            ];
          }

          outgoingBody = JSON.stringify(parsed);
        } catch {
          /* keep raw */
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
            if (!res.ok) {
              console.error(
                `[api/chat] Backend HTTP ${res.status}: ${text.replace(/\s+/g, " ").trim().slice(0, 200)}`
              );
              return Response.json(
                { error: "Sorry, DAP AI is offline right now." },
                { status: 502 }
              );
            }
            let parsedResponse: {
              choices?: { message?: { content?: string } }[];
              message?: { content?: string };
              error?: string | { message?: string };
            };
            try {
              parsedResponse = JSON.parse(text);
            } catch {
              console.error(
                `[api/chat] Backend returned non-JSON: ${text.replace(/\s+/g, " ").trim().slice(0, 200)}`
              );
              return Response.json(
                { error: "Sorry, DAP AI is offline right now." },
                { status: 502 }
              );
            }
            const content =
              parsedResponse.choices?.[0]?.message?.content ??
              parsedResponse.message?.content;
            if (typeof content !== "string" || !content.trim()) {
              console.error("[api/chat] Backend returned no assistant content.");
              return Response.json(
                { error: "Sorry, DAP AI is offline right now." },
                { status: 502 }
              );
            }
            if (model === "dap-ai-lite") {
              const cleaned = sanitizeLiteReply(content);
              if (parsedResponse.choices?.[0]?.message) {
                parsedResponse.choices[0].message.content = cleaned;
              } else if (parsedResponse.message) {
                parsedResponse.message.content = cleaned;
              }
              text = JSON.stringify(parsedResponse);
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
              { error: "Sorry, DAP AI is offline right now." },
              { status: 502 }
            );
          }
        });
      },
    },
  },
});
