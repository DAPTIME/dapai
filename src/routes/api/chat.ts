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
  newStreamOutcome,
  describeOutcome,
  OrchestratorUnavailableError,
} from "@/lib/dap-orchestrator.server";
import { sanitizeLiteReply, hasLiteReasoningLeak } from "@/lib/lite-sanitize";
import {
  MODEL_IDS,
  modelInfo,
  effectiveModelFor,
  orchestratorModelName,
  type ModelId,
} from "@/lib/models";
import { CUTOFF_MARKER } from "@/lib/cutoff-marker";
import { TIER_RANK } from "@/lib/tier-gate";
import { parseSiteStatus, siteOpenTo } from "@/lib/site-status";

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
  /* The model the picker selected. Optional so an older client that does
     not send one still works; the tier gate below decides what actually
     runs either way, so this is a request, never an authorisation. */
  model: z.enum(MODEL_IDS).optional(),
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

        /* The admin client may be absent (no SUPABASE_SERVICE_ROLE_KEY on
           the deployment). Every use below degrades instead of dying: the
           kill-switch read fails open, the tier read falls back to the
           caller's own profile row, the model prompt defaults to empty, and
           refunds are skipped. Chat must not go down over a settings key. */
        const { tryAdminClient } = await import("@/lib/admin-client.server");
        const adminClient = await tryAdminClient();
        const { createClient } = await import("@supabase/supabase-js");
        const asCaller = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

        /* Bans, before anything is charged or dispatched.
           This endpoint authenticates inline rather than through
           requireSupabaseAuth, and the ban check lived only in that
           middleware — so a suspended account could keep chatting here
           until its access token expired, up to an hour later. A ban writes
           auth.users.banned_until, which stops Supabase issuing or
           refreshing tokens, but a token already in the browser stays
           cryptographically valid; reading the column closes that window.

           Same rule as the middleware: read with the caller's own client so
           it still works without a service-role key, and let only an
           explicit `true` block, so a failed lookup cannot lock everyone
           out of chat. */
        const { data: callerProfile } = await asCaller
          .from("profiles")
          .select("banned, site_admin")
          .eq("id", callerId)
          .maybeSingle();
        const callerIsAdmin = callerProfile?.site_admin === true;
        if (callerProfile?.banned === true) {
          return Response.json(
            { error: "Your account has been suspended." },
            { status: 403 }
          );
        }

        // Kill switches.
        const { data: settingsRows } = adminClient
          ? await adminClient
              .from("ai_settings")
              .select("id, system_prompt")
              .in("id", ["site_status", "feature_ai_enabled"])
          : { data: null };
        const siteRow = (settingsRows ?? []).find((r) => r.id === "site_status");
        const siteStatus = parseSiteStatus(siteRow?.system_prompt);
        // "admin" leaves the site working for site admins only. callerProfile
        // was already read for the ban check, so this costs no extra query.
        const siteClosed = !siteOpenTo(siteStatus, callerIsAdmin);
        const featureOff = (settingsRows ?? []).some(
          (r) =>
            r.id !== "site_status" &&
            (r.system_prompt ?? "on").trim().toLowerCase() === "off"
        );
        if (siteClosed || featureOff) {
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

        // Tier: through the admin client when there is one (the chat owner
        // may differ from the caller for admin reads); otherwise the
        // caller's own row, which RLS lets them read.
        const { data: profile } = await (adminClient ?? asCaller)
          .from("profiles")
          .select("tier")
          .eq("id", adminClient ? ownerId : callerId)
          .maybeSingle();
        const tier = ((profile?.tier as Tier | undefined) ?? "free") as Tier;
        const limits = TIER_LIMITS[tier];

        /* Same gate the non-streaming path applies, and now literally the
           same function: honour the picked model only if this account may
           use it, otherwise fall back to the best one it may. Until this
           endpoint accepted a model at all, the picker changed nothing and
           the orchestrator logged MODEL picked='' on every request. */
        const effectiveModel: ModelId = effectiveModelFor(tier, body.model);

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
          /* Say what the allowance actually is. "Slow down" leaves someone
             guessing whether they are near a limit or have hit a fault,
             and on a paid plan it matters that the number is higher. */
          const { data: perMinute } = await asCaller
            .rpc("my_messages_per_minute")
            .single();
          const allowance =
            typeof perMinute === "number"
              ? ` Your plan allows ${perMinute} message${perMinute === 1 ? "" : "s"} a minute.`
              : "";
          return Response.json(
            {
              error:
                "You're sending messages faster than DAP AI can answer them. Please wait a moment and try again." +
                allowance,
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

        /* Queue slot: only one generation runs system-wide at a time.
           That is what the comment here used to say, and it was not true.
           queue_claim returns whether the slot was actually taken and the
           answer was being thrown away, so every request dialled the
           orchestrator immediately no matter how many were already running.
           On one box that is how you get several generations competing and
           connections dropping for no reason anyone can see.

           So wait for the claim to succeed. Fail open on a timeout — being
           slow is better than being broken, and a queue fault must not be
           able to take chat down — but under normal load this is now a
           real queue rather than a record of one. */
        const { data: ticket } = await Promise.resolve(
          asCaller.rpc("queue_join", { _chat_id: body.chatId }).maybeSingle()
        ).catch(() => ({ data: null }) as { data: null });
        const ticketId = (ticket as { id?: string } | null)?.id ?? body.chatId;

        const claimDeadline = Date.now() + 120_000;
        let claimed = false;
        for (;;) {
          claimed = await Promise.resolve(
            asCaller.rpc("queue_claim", { _id: ticketId })
          )
            .then((r: { data?: unknown }) => r.data === true)
            .catch(() => false);
          if (claimed || Date.now() > claimDeadline) break;
          // Long enough not to hammer the database, short enough that the
          // wait is not noticeable once the box frees up.
          await new Promise((r) => setTimeout(r, 1_500));
        }

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

        const { data: perModel } = adminClient
          ? await adminClient
              .from("ai_settings")
              .select("system_prompt")
              .eq("id", "global")
              .maybeSingle()
          : { data: null };
        const systemPrompt = perModel?.system_prompt?.trim() ?? "";

        const anonymous = !!chat.is_incognito;
        const { data: memRows } = TIER_LIMITS[tier].memory && !anonymous
          ? await asCaller.from("user_memories").select("content").eq("enabled", true).order("created_at", { ascending: true })
          : { data: null as { content: string }[] | null };
        const memoryBlock =
          memRows && memRows.length > 0
            ? `What you remember about this user (use naturally, don't recite):\n${memRows.map((m) => `- ${m.content}`).join("\n")}`
            : "";

        /* How far back DAP AI can see is a property of the account, not of
           the model the picker happens to be on. Ordering newest-first with
           a limit and reversing gets the last N turns in one query, rather
           than pulling an entire thread back to trim it — this used to send
           every message ever sent in the chat, on every turn. */
        const { data: historyDesc } = await asCaller
          .from("chat_messages")
          .select("role, content")
          .eq("chat_id", body.chatId)
          .order("created_at", { ascending: false })
          .limit(limits.historyTurns * 2);
        const history = (historyDesc ?? []).slice().reverse();

        const messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          ...(memoryBlock ? [{ role: "system" as const, content: memoryBlock }] : []),
          ...(body.studyMode ? [{ role: "system" as const, content: STUDY_MODE_PROMPT }] : []),
          ...history.map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content })),
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

        /* Closing the tab does not cancel the answer.

           The browser dropping this connection used to abort the
           orchestrator call, so switching away mid-reply threw the
           generation away — the work was already being done, the box was
           already busy doing it, and the person came back to nothing.

           Now the connection going away only stops us writing to it. The
           generation runs to the end and the reply is saved, so it is
           waiting in the thread when they return. Pressing Stop is a
           different thing entirely and still stops it: that goes through
           stopChatMessage, which records the interruption and stores
           whatever had been streamed. */
        let clientGone = false;
        const startedAt = new Date().toISOString();
        request.signal.addEventListener("abort", () => {
          clientGone = true;
        });

        let assistantText = "";
        let gotDone = false;
        /* How the orchestrator stream ended, so a failure can say which
           kind it was instead of only that it happened. */
        const outcome = newStreamOutcome();

        /* Hold the slot while the answer is being generated.
           queue_claim stamps heartbeat_at once and nothing here refreshed
           it, while queue_reap cancels any running ticket whose heartbeat
           is over 90 seconds old. Lite answers in about ten seconds so it
           never noticed; Pro takes 90-150 by design, so every Pro
           generation would have its own ticket reaped out from under it
           mid-flight and the lane handed to the next request — on hardware
           that runs one generation at a time. That only became reachable
           when the queue started working at all, so it has never actually
           bitten, and it would have on the first slow answer.

           A timer rather than beating per token: the expert phase is
           legitimately silent for minutes, and "this request is still
           open" is exactly what the heartbeat means. */
        let beat: ReturnType<typeof setInterval> | undefined = setInterval(() => {
          void Promise.resolve(asCaller.rpc("queue_beat", { _id: ticketId })).catch(() => {});
        }, 25_000);
        const stopBeating = () => {
          if (beat) clearInterval(beat);
          beat = undefined;
        };

        const releaseAndRefund = async (opts: { refund: boolean }) => {
          stopBeating();
          if (opts.refund && chargedCost > 0) {
            // Through the service-role client: refund_usage is no longer
            // granted to authenticated, because taking the amount as an
            // argument from whoever is calling let a signed-in account loop
            // it and hold its own quota at zero.
            if (adminClient) {
              await Promise.resolve(
                adminClient.rpc("admin_refund_usage", {
                  _user_id: callerId,
                  _cost: chargedCost,
                  _images: chargedImages,
                })
              ).catch(() => {});
            }
          }
          await Promise.resolve(
            asCaller.rpc("queue_release", { _id: ticketId, _cancelled: opts.refund })
          ).catch(() => {});
        };

        const persistStopped = async () => {
          /* Same marker as the stop button writes. The reader never sees
             it — the UI strips it — but it stays in the stored text, which
             is what goes back to the model as history, so the next turn
             knows the previous answer was cut off rather than finished. */
          const content = assistantText.trim()
            ? `${assistantText.trim()}\n\n${CUTOFF_MARKER}`
            : CUTOFF_MARKER;
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
            const send = (obj: unknown) => {
              if (clientGone) return;
              try {
                controller.enqueue(encoder.encode(sse(obj)));
              } catch {
                // The reader has gone. Keep generating and persisting; the
                // answer is for the thread, not for this connection.
                clientGone = true;
              }
            };
            try {
              const res = await openOrchestratorStream({
                tier,
                // The display name is what the orchestrator routes on.
                model: orchestratorModelName(effectiveModel),
                messages,
                signal: ctrl.signal,
              });
              for await (const evt of readOrchestratorEvents(res, outcome)) {
                if (evt.type === "token") {
                  assistantText += evt.text ?? "";
                  // No sanitising per token: this used to run the full
                  // sanitizeLiteReply regex suite over the entire text so
                  // far on every single token and then discard the result,
                  // which is quadratic in reply length and slowed the
                  // stream down as the answer grew. The one pass that
                  // matters happens once, on "done", below.
                  send(evt);
                } else if (evt.type === "status") {
                  send(evt);
                } else if (evt.type === "done") {
                  gotDone = true;
                  let cleaned = assistantText;
                  if (hasLiteReasoningLeak(cleaned)) cleaned = sanitizeLiteReply(cleaned);

                  /* Did Stop get there first?

                     Now that closing the tab no longer cancels the answer,
                     the only way this generation ends early is someone
                     pressing Stop — and that path already stores what had
                     been streamed, with the interrupted marker. Writing
                     again here would leave the thread holding the same
                     reply twice, once stopped and once whole. */
                  const { data: alreadyWritten } = await asCaller
                    .from("chat_messages")
                    .select("id")
                    .eq("chat_id", body.chatId)
                    .eq("role", "assistant")
                    .gt("created_at", startedAt)
                    .limit(1)
                    .maybeSingle<{ id: string }>();
                  if (alreadyWritten) {
                    await releaseAndRefund({ refund: false });
                    send({ type: "done" });
                    continue;
                  }

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
                send({
                  type: "error",
                  message: "Connection lost. Please try again.",
                  /* Timing and stage only — no URL, no secret. The UI shows
                     `message`; this is here so a lost answer can be
                     diagnosed from the response itself rather than needing
                     the deployment's logs. */
                  detail: describeOutcome(outcome),
                });
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
                  detail: describeOutcome(outcome),
                });
              }
            } finally {
              stopBeating();
              controller.close();
            }
          },
          cancel() {
            // Not an abort: see the note above. The reply is still finished
            // and saved for when they come back.
            clientGone = true;
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
