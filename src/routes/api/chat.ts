import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  SUPABASE_URL as PUBLIC_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY as PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/supabase/public-config";
import type { Tier } from "@/lib/tier-rank";
import {
  MAX_IMAGES_PER_RESPONSE,
  PROMPT_TOO_LONG_MESSAGE,
  TIER_LIMITS,
  costOfPrompt,
  estimateTokens,
  isLedgerMissing,
  limitRefusal,
  type ChargeResult,
} from "@/lib/usage-limits";
import {
  openOrchestratorStream,
  readOrchestratorEvents,
  OrchestratorUnavailableError,
} from "@/lib/dap-orchestrator.server";
import { sanitizeLiteReply, hasLiteReasoningLeak } from "@/lib/lite-sanitize";

/**
 * Streaming chat proxy.
 *
 * POST /api/chat, `Authorization: Bearer <supabase access token>`
 * body: { chatId: uuid, text: string, images?: string[], studyMode?: boolean }
 *
 * Responds text/event-stream, forwarding orchestrator frames verbatim:
 *   {"type":"status",...} {"type":"token","text":...} {"type":"done"} {"type":"error","message":...}
 *
 * Only one request runs system-wide at a time (queue_release holds the slot
 * for the duration of the call and always releases it).
 */

const Body = z.object({
  chatId: z.string().uuid(),
  text: z.string().min(1).max(8000),
  images: z.array(z.string().startsWith("data:image/").max(8_000_000)).max(4).optional(),
  studyMode: z.boolean().optional(),
});

const STUDY_MODE_PROMPT =
  "STUDY MODE IS ON. Act as a Socratic tutor, not an answer machine. Rules: (1) Never give the full answer or final solution up front. (2) Work in ONE small step per reply, then stop and ask a single question that makes the student do the next step. (3) If the student is stuck, give a hint or a simpler sub-question — still not the answer. (4) If they get something wrong, say what's off and ask a question that leads them to fix it. (5) Only reveal the complete answer if the student explicitly asks for it twice, or has clearly reached it themselves — then confirm and summarise briefly. (6) Keep replies short (under 120 words) and encouraging. This overrides any instruction to be comprehensive.";

function sse(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let callerId: string;
        try {
          const { createClient } = await import("@supabase/supabase-js");
          if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
            return Response.json({ error: "Server auth not configured" }, { status: 500 });
          }
          const sb = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { createClient } = await import("@supabase/supabase-js");
        const asCaller = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

        // Kill switches.
        const { data: settingsRows } = await supabaseAdmin
          .from("ai_settings")
          .select("id, system_prompt")
          .in("id", ["site_status", "feature_ai_enabled"]);
        const off = (settingsRows ?? []).some(
          (r) => (r.system_prompt ?? "on").trim().toLowerCase() === "off"
        );
        if (off) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  sse({ type: "error", message: "DAP AI is undergoing major reworks. Please try again later." })
                )
              );
              controller.close();
            },
          });
          return new Response(stream, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        }

        // Chat ownership.
        const { data: chat } = await asCaller
          .from("chats")
          .select("id, user_id, title, is_incognito")
          .eq("id", body.chatId)
          .maybeSingle();
        if (!chat) return Response.json({ error: "Chat not found." }, { status: 404 });
        const ownerId = chat.user_id as string;

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("tier")
          .eq("id", ownerId)
          .maybeSingle();
        const tier = ((profile?.tier as Tier | undefined) ?? "free") as Tier;
        const limits = TIER_LIMITS[tier];

        const imageCount = body.images?.length ?? 0;
        if (imageCount > MAX_IMAGES_PER_RESPONSE) {
          return Response.json(
            { error: `Only ${MAX_IMAGES_PER_RESPONSE} image per message, on every plan.` },
            { status: 400 }
          );
        }
        if (imageCount > 0 && limits.imagesPerDay <= 0) {
          return Response.json(
            { error: "Images aren't part of your plan. Upgrade to generate them." },
            { status: 403 }
          );
        }

        /* Rate limit before anything is spent: 4 requests per minute per
           person, every tier including exclusive. One request is dispatched
           at a time system-wide, so without this one impatient tab can hold
           the slot away from everyone else. A missing function (older
           database) must not block chat, hence the permissive default. */
        const { data: rateOk, error: rateErr } = await asCaller.rpc("chat_rate_ok");
        if (!rateErr && rateOk === false) {
          return Response.json(
            {
              error:
                "You're sending messages faster than DAP AI can answer them. Please wait a moment and try again.",
            },
            { status: 429 }
          );
        }

        const promptTokens = estimateTokens(body.text);
        const cost = costOfPrompt(tier, promptTokens);
        if (cost === null) return Response.json({ error: PROMPT_TOO_LONG_MESSAGE }, { status: 400 });
        const chargedImages = Math.min(imageCount, 1);

        // Exclusive never checks or deducts against the ledger at all —
        // no charge_usage call, so nothing is ever written for it.
        let chargedCost = 0;
        if (tier !== "exclusive") {
          const { data: charged, error: chargeErr } = await asCaller
            .rpc("charge_usage", { _cost: cost, _images: chargedImages })
            .maybeSingle();
          if (chargeErr && !isLedgerMissing(chargeErr)) {
            return Response.json(
              { error: "We couldn't check your usage allowance. Please try again." },
              { status: 503 }
            );
          }
          if (charged && (charged as { ok?: boolean }).ok === false) {
            return Response.json({ error: limitRefusal(charged as ChargeResult, tier) }, { status: 429 });
          }
          chargedCost = chargeErr ? 0 : cost;
        }

        // Queue slot: only one generation runs system-wide at a time.
        const { data: ticket } = await Promise.resolve(
          asCaller.rpc("queue_join", { _chat_id: body.chatId }).maybeSingle()
        ).catch(() => ({ data: null }) as { data: null });
        const ticketId = (ticket as { id?: string } | null)?.id ?? body.chatId;
        await Promise.resolve(asCaller.rpc("queue_claim", { _id: ticketId })).catch(
          () => {}
        );

        const storedUserContent =
          imageCount > 0
            ? `${body.text}\n\n_(📎 ${imageCount} image${imageCount > 1 ? "s" : ""} attached)_`
            : body.text;

        await asCaller.from("chat_messages").insert({
          chat_id: body.chatId,
          user_id: ownerId,
          role: "user",
          content: storedUserContent,
        });

        if (chat.title === "New chat") {
          await asCaller.from("chats").update({ title: body.text.slice(0, 60) }).eq("id", body.chatId);
        } else {
          await asCaller.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", body.chatId);
        }

        const { data: perModel } = await supabaseAdmin
          .from("ai_settings")
          .select("system_prompt")
          .eq("id", "global")
          .maybeSingle();
        const systemPrompt = perModel?.system_prompt?.trim() ?? "";

        const anonymous = !!chat.is_incognito;
        const { data: memRows } = TIER_LIMITS[tier].memory && !anonymous
          ? await asCaller.from("user_memories").select("content").eq("enabled", true).order("created_at", { ascending: true })
          : { data: null as { content: string }[] | null };
        const memoryBlock =
          memRows && memRows.length > 0
            ? `What you remember about this user (use naturally, don't recite):\n${memRows.map((m) => `- ${m.content}`).join("\n")}`
            : "";

        const { data: history } = await asCaller
          .from("chat_messages")
          .select("role, content")
          .eq("chat_id", body.chatId)
          .order("created_at", { ascending: true });

        const messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          ...(memoryBlock ? [{ role: "system" as const, content: memoryBlock }] : []),
          ...(body.studyMode ? [{ role: "system" as const, content: STUDY_MODE_PROMPT }] : []),
          ...(history ?? []).map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content })),
        ];
        if ((body.images?.length ?? 0) > 0) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
              messages[i] = {
                role: "user",
                content: [
                  { type: "text", text: body.text },
                  ...(body.images ?? []).map((url) => ({ type: "image_url", image_url: { url } })),
                ],
              };
              break;
            }
          }
        }

        const ctrl = new AbortController();
        request.signal.addEventListener("abort", () => ctrl.abort());

        let assistantText = "";
        let gotDone = false;

        const releaseAndRefund = async (opts: { refund: boolean }) => {
          if (opts.refund && chargedCost > 0) {
            // Through the service-role client: refund_usage is no longer
            // granted to authenticated, because taking the amount as an
            // argument from whoever is calling let a signed-in account loop
            // it and hold its own quota at zero.
            await Promise.resolve(
              supabaseAdmin.rpc("admin_refund_usage", {
                _user_id: callerId,
                _cost: chargedCost,
                _images: chargedImages,
              })
            ).catch(() => {});
          }
          await Promise.resolve(
            asCaller.rpc("queue_release", { _id: ticketId, _cancelled: opts.refund })
          ).catch(() => {});
        };

        const persistStopped = async () => {
          const content = assistantText.trim()
            ? `${assistantText.trim()}\n\n_Stopped._`
            : "_Stopped._";
          await asCaller.from("chat_messages").insert({
            chat_id: body.chatId,
            user_id: ownerId,
            role: "assistant",
            content,
          });
        };

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
            try {
              const res = await openOrchestratorStream({ tier, messages, signal: ctrl.signal });
              for await (const evt of readOrchestratorEvents(res)) {
                if (evt.type === "token") {
                  assistantText += evt.text ?? "";
                  let cleaned = sanitizeLiteReply(assistantText);
                  void cleaned;
                  send(evt);
                } else if (evt.type === "status") {
                  send(evt);
                } else if (evt.type === "done") {
                  gotDone = true;
                  let cleaned = assistantText;
                  if (hasLiteReasoningLeak(cleaned)) cleaned = sanitizeLiteReply(cleaned);
                  await asCaller.from("chat_messages").insert({
                    chat_id: body.chatId,
                    user_id: ownerId,
                    role: "assistant",
                    content: cleaned || "Sorry, DAP AI is offline right now.",
                  });
                  await releaseAndRefund({ refund: false });
                  send({ type: "done" });
                } else if (evt.type === "error") {
                  send(evt);
                }
              }
              if (!gotDone) {
                await persistStopped();
                await releaseAndRefund({ refund: true });
                send({ type: "error", message: "Connection lost. Please try again." });
              }
            } catch (e) {
              const err = e as Error;
              if (!gotDone) {
                await persistStopped();
                await releaseAndRefund({ refund: true });
              }
              if (err.name !== "AbortError") {
                send({
                  type: "error",
                  message:
                    e instanceof OrchestratorUnavailableError
                      ? "Sorry, DAP AI is offline right now."
                      : "Connection lost. Please try again.",
                });
              }
            } finally {
              controller.close();
            }
          },
          cancel() {
            ctrl.abort();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
