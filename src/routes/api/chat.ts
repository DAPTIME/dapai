import {
  SUPABASE_URL as PUBLIC_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY as PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/supabase/public-config";
import { createFileRoute } from "@tanstack/react-router";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
import { enqueue } from "@/lib/ai-queue";
import {
  TIER_LIMITS,
  MAX_IMAGES_PER_RESPONSE,
  PROMPT_TOO_LONG_MESSAGE,
  costOfPrompt,
  estimateTokens,
  isLedgerMissing,
  limitRefusal,
  type ChargeResult,
} from "@/lib/usage-limits";

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

        // Reply length is governed by the orchestrator itself.
        let callerTier: Tier = "free";

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
            callerTier = tier;
            const limits = TIER_LIMITS[tier];
            // Carried out of this block so the relayed request can be
            // capped: without it a raw caller sets their own max_tokens and
            // pulls a longer reply than their plan allows.

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

            if (images > MAX_IMAGES_PER_RESPONSE) {
              return Response.json(
                { error: `Only ${MAX_IMAGES_PER_RESPONSE} image per message, on every plan.` },
                { status: 400 }
              );
            }
            if (images > 0 && limits.imagesPerDay <= 0) {
              return Response.json(
                { error: "Images aren't part of your plan. Upgrade to generate them." },
                { status: 403 }
              );
            }

            // Length first, and it costs nothing: an over-long message is
            // refused rather than billed at the top band and then rejected.
            const promptTokens = estimateTokens(promptText);
            const cost = costOfPrompt(tier, promptTokens);
            if (cost === null) {
              return Response.json({ error: PROMPT_TOO_LONG_MESSAGE }, { status: 400 });
            }

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
                { error: limitRefusal(charged as ChargeResult, tier) },
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



        // ── Stream the orchestrator's reply straight through as SSE ──
        const {
          aiEnabled,
          openOrchestratorStream,
          readOrchestratorEvents,
          AI_MAINTENANCE_MESSAGE,
          CONNECTION_LOST_MESSAGE,
        } = await import("@/lib/dap-orchestrator.server");

        if (!(await aiEnabled())) {
          return Response.json({ error: AI_MAINTENANCE_MESSAGE }, { status: 503 });
        }

        let messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [];
        try {
          const parsed = JSON.parse(raw) as { messages?: typeof messages };
          messages = Array.isArray(parsed.messages) ? parsed.messages : [];
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }
        if (messages.length === 0) {
          return Response.json({ error: "No messages to send." }, { status: 400 });
        }

        // One generation at a time — inference runs on a single machine.
        return enqueue(`model:${model}`, async () => {
          const encoder = new TextEncoder();
          let upstream: Response;
          try {
            upstream = await openOrchestratorStream({ tier: callerTier, messages });
          } catch {
            return Response.json(
              { error: "Sorry, DAP AI is offline right now." },
              { status: 502 }
            );
          }

          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const send = (obj: unknown) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
              let sawDone = false;
              let sawToken = false;
              try {
                for await (const evt of readOrchestratorEvents(upstream)) {
                  if (evt.type === "token") {
                    sawToken = true;
                    send(evt);
                  } else if (evt.type === "status") {
                    send(evt);
                  } else if (evt.type === "error") {
                    send({ type: "error", message: "Sorry, DAP AI is offline right now." });
                    sawDone = true;
                    break;
                  } else if (evt.type === "done") {
                    sawDone = true;
                    send({ type: "done" });
                    break;
                  }
                }
              } catch (e) {
                console.error(`[api/chat] stream failed: ${(e as Error).message}`);
              }
              if (!sawDone) {
                send({
                  type: "error",
                  message: sawToken ? CONNECTION_LOST_MESSAGE : "Sorry, DAP AI is offline right now.",
                });
              }
              controller.close();
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-store",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          });
        });
      },
    },
  },
});
