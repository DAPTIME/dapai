import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sanitizeLiteReply } from "@/lib/lite-sanitize";
import { isSafetyBlock, SAFETY_BLOCKED_MESSAGE } from "@/lib/safety";
import {
  orchestratorComplete,
  OrchestratorUnavailableError,
} from "@/lib/dap-orchestrator.server";

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
           caller can run the orchestrator flat out for free, which costs
           real money and starves signed-in users. */
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

        // Honor the admin maintenance flags for DAP AI.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: rows } = await supabaseAdmin
            .from("ai_settings")
            .select("id, system_prompt")
            .in("id", ["site_status", "feature_ai_enabled", "feature_lite_model"]);
          const off = (rows ?? []).some(
            (r) => (r.system_prompt ?? "on").trim().toLowerCase() === "off"
          );
          if (off) {
            return new Response(
              JSON.stringify({
                error: "DAP AI is undergoing major reworks. Please try again later.",
              }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }
        } catch {
          /* if the check fails, fall through and let the orchestrator handle it */
        }

        try {
          const raw = await orchestratorComplete({
            tier: "free",
            timeoutMs: 60_000,
            messages: [
              { role: "system", content: LITE_NO_THINK_PROMPT },
              { role: "system", content: TRIAL_NOTE },
              { role: "user", content: parsed.text },
            ],
          });

          if (isSafetyBlock({ error: raw }, 200)) {
            return new Response(JSON.stringify({ reply: SAFETY_BLOCKED_MESSAGE }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          const out = sanitizeLiteReply(raw);
          return new Response(JSON.stringify({ reply: out }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const err = e as Error;
          const message =
            err instanceof OrchestratorUnavailableError
              ? "Sorry, DAP AI is offline right now."
              : err.name === "AbortError"
                ? "DAP AI Lite took too long to respond. Please try again."
                : "Sorry, DAP AI is offline right now.";
          return new Response(JSON.stringify({ error: message }), {
            status: 504,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
