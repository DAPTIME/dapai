import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sanitizeLiteReply } from "@/lib/lite-sanitize";
import { resolveOllamaModel } from "@/lib/ollama-models.server";
import { isSafetyBlock, SAFETY_BLOCKED_MESSAGE } from "@/lib/safety";
import { TIER_LIMITS } from "@/lib/usage-limits";

const Body = z.object({
  text: z.string().min(1).max(2000),
});

const LITE_NO_THINK_PROMPT =
  "You are DAP AI Lite. Thinking mode is OFF. Answer with only the final user-facing response. Never write internal reasoning, planning, analysis, scratchpad, or self-talk. Do not output <think> tags or explain how you will answer.";

const TRIAL_NOTE =
  "This is a free trial message from an anonymous visitor. Keep your reply brief (under 150 words). At the end, gently invite them to create a free account to keep chatting and unlock chat history.";

export const Route = createFileRoute("/api/public/lite-try")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof Body>;
        try {
          const raw = await request.json();
          parsed = Body.parse(raw);
        } catch {
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        /* This endpoint takes no credentials — that is the point, it is the
           try-before-signup box — so the only thing standing between it and
           someone looping it is a per-IP cap. Without one, an anonymous
           caller can run the owner's own inference hardware flat out for
           free, which costs real money and starves signed-in users. */
        const { consumeIpQuota } = await import("@/lib/rate-limit.server");
        if (!(await consumeIpQuota("attempt:lite-try", 5, 10 * 60 * 1000))) {
          return new Response(
            JSON.stringify({
              error:
                "That's a few messages from this network already. Create a free account to keep going.",
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }

        // Honor the admin maintenance flag for DAP AI Lite.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: flag } = await supabaseAdmin
            .from("ai_settings")
            .select("system_prompt")
            .eq("id", "feature_lite_model")
            .maybeSingle();
          if ((flag?.system_prompt ?? "on").trim().toLowerCase() === "off") {
            return new Response(
              JSON.stringify({
                error: "DAP AI is undergoing major reworks. Please try again later.",
              }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }
        } catch {
          /* if the check fails, fall through and let upstream handle */
        }

        const backend =
          process.env.AI_BACKEND_URL_LITE ?? process.env.AI_BACKEND_URL;
        const key =
          process.env.AI_BACKEND_KEY_LITE ?? process.env.AI_BACKEND_KEY;
        const upstreamModel =
          process.env.AI_BACKEND_MODEL_LITE ?? "dap-ai-lite";

        if (!backend) {
          return new Response(
            JSON.stringify({
              error:
                "DAP AI Lite isn't available right now. Please try again later.",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60_000);
        try {
          const resolved = await resolveOllamaModel(backend, key, upstreamModel);
          if (resolved.installed && resolved.installed.length === 0) {
            return new Response(
              JSON.stringify({
                error: "Sorry, DAP AI is offline right now.",
              }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }
          const resolvedModel = resolved.model;
          const res = await fetch(backend, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
            },
            body: JSON.stringify({
              model: resolvedModel,
              stream: false,
              /* The signed-out trial is a Free account in everything but
                 the sign-in: same reply ceiling, so an anonymous visitor
                 cannot pull a longer answer out of the hardware than a
                 Free user who registered for one. */
              max_tokens: TIER_LIMITS.free.maxResponseTokens,
              temperature: 0,
              top_p: 1,
              reasoning_effort: "none",
              thinking: false,
              enable_thinking: false,
              chat_template_kwargs: {
                enable_thinking: false,
                thinking: false,
                no_think: true,
              },
              extra_body: {
                chat_template_kwargs: {
                  enable_thinking: false,
                  thinking: false,
                  no_think: true,
                },
              },
              messages: [
                { role: "system", content: LITE_NO_THINK_PROMPT },
                { role: "system", content: TRIAL_NOTE },
                { role: "user", content: parsed.text },
              ],
            }),
            signal: ctrl.signal,
          });
          const raw = await res.text();
          let json: {
            choices?: { message?: { content?: string } }[];
            message?: { content?: string };
            error?: string | { message?: string };
          } = {};
          try {
            json = JSON.parse(raw);
          } catch {
            return new Response(
              JSON.stringify({
                error: "Sorry, DAP AI is offline right now.",
              }),
              { status: 502, headers: { "Content-Type": "application/json" } }
            );
          }
          const errStr =
            typeof json?.error === "string" ? json.error : json?.error?.message;
          /* Checked before the no-content branch: a blocked request comes
             back empty, and calling that an outage tells the visitor to
             retry something that will never go through. */
          if (isSafetyBlock(json, res.status)) {
            console.warn(`[lite-try] blocked upstream (HTTP ${res.status})`);
            return new Response(JSON.stringify({ reply: SAFETY_BLOCKED_MESSAGE }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          const content =
            json?.choices?.[0]?.message?.content ?? json?.message?.content;
          if (!content) {
            console.error(`[lite-try] no content from backend: ${errStr ?? raw.slice(0, 200)}`);
            return new Response(
              JSON.stringify({ error: "Sorry, DAP AI is offline right now." }),
              { status: 502, headers: { "Content-Type": "application/json" } }
            );
          }
          let out = content;
          out = sanitizeLiteReply(out);
          return new Response(JSON.stringify({ reply: out }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const err = e as Error;
          return new Response(
            JSON.stringify({
              error:
                err.name === "AbortError"
                  ? "DAP AI Lite took too long to respond. Please try again."
                  : "Sorry, DAP AI is offline right now.",
            }),
            { status: 504, headers: { "Content-Type": "application/json" } }
          );
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
