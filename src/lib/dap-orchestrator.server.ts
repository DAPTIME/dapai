/**
 * The one and only AI backend: the DAP orchestrator.
 *
 * Every reply the site produces goes through a single server-side call:
 *
 *   POST {DAP_ORCHESTRATOR_URL}/v1/chat
 *   X-DAP-Auth: {DAP_SHARED_SECRET}
 *   {
 *     "tier":  "free" | "go" | "pro" | "exclusive",
 *     "model": "DAP AI 4 Lite" | "DAP AI 4 Pro Lite" | "DAP AI 4 Pro",
 *     "messages": [...]
 *   }
 *
 * `model` is the picker's display name, verbatim — the orchestrator matches
 * on the substrings "lite" and "pro lite", so an id or a lowercased copy
 * routes to the wrong pipeline. It caps the tier downwards only; `tier`
 * remains the account's real plan and stays the ceiling.
 *
 * The response is Server-Sent Events, each line `data: ` + JSON:
 *   { "type": "token",  "text": "..." }
 *   { "type": "status", "stage": "routing"|"refining"|"expert"|"stitching" }
 *   { "type": "done" }
 *   { "type": "error",  "message": "..." }
 *
 * Both the URL and the secret are server-only environment secrets. They are
 * never sent to the browser: the client talks to /api/chat on this origin,
 * which is the only thing that knows where the orchestrator lives.
 */

export const AI_MAINTENANCE_MESSAGE =
  "DAP AI is temporarily offline for maintenance.";
export const CONNECTION_LOST_MESSAGE =
  "Connection lost. Please try again.";

export type OrchestratorStage =
  | "routing"
  | "refining"
  | "expert"
  | "stitching";

export type OrchestratorEvent =
  | { type: "token"; text: string }
  | { type: "status"; stage: OrchestratorStage }
  | { type: "done" }
  | { type: "error"; message: string };

export class OrchestratorUnavailableError extends Error {
  constructor(message = "AI backend unavailable") {
    super(message);
    this.name = "OrchestratorUnavailableError";
  }
}

export interface OrchestratorMessage {
  role: "system" | "user" | "assistant";
  content: unknown;
}

/** Read the orchestrator secrets. Server-only — never at module scope. */
export function orchestratorConfig(): { url: string; secret: string } {
  const raw = (process.env["DAP_ORCHESTRATOR_URL"] ?? "").trim();
  const secret = (process.env["DAP_SHARED_SECRET"] ?? "").trim();
  if (!raw || !secret) {
    const missing = [
      ...(!raw ? ["DAP_ORCHESTRATOR_URL"] : []),
      ...(!secret ? ["DAP_SHARED_SECRET"] : []),
    ].join(", ");
    console.error(`[orchestrator] missing secret(s): ${missing}`);
    throw new OrchestratorUnavailableError();
  }
  const base = raw.replace(/\/+$/, "");
  const url = /\/v1\/chat$/.test(base) ? base : `${base}/v1/chat`;
  return { url, secret };
}

/** True unless an admin switched the "AI Enabled" toggle off. */
export async function aiEnabled(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data } = await supabaseAdmin
      .from("ai_settings")
      .select("system_prompt")
      .eq("id", "feature_ai_enabled")
      .maybeSingle();
    return (data?.system_prompt ?? "on").trim().toLowerCase() !== "off";
  } catch (e) {
    // A settings lookup failure must not silently disable the whole site.
    console.error("[orchestrator] ai_enabled lookup failed:", (e as Error).message);
    return true;
  }
}

/** Open the streaming request. Throws OrchestratorUnavailableError on failure. */
export async function openOrchestratorStream(opts: {
  tier: string;
  /** Display name of the model the sender picked, e.g. "DAP AI 4 Lite". */
  model?: string;
  messages: OrchestratorMessage[];
  signal?: AbortSignal;
}): Promise<Response> {
  const { url, secret } = orchestratorConfig();

  /* Exactly what goes on the wire, built once so the log and the request
     cannot drift apart. An empty `model` is the failure this logging exists
     to catch: the orchestrator prints MODEL picked='' for it and silently
     runs the full pipeline, which looks like slowness rather than a bug. */
  const payload = {
    tier: opts.tier || "free",
    model: opts.model || "",
    messages: opts.messages,
  };

  /* The body, never the secret. X-DAP-Auth is reported as present/absent
     only — a missing or wrong one comes back as 404 from the orchestrator,
     which reads like a routing mistake, so it is worth being able to tell
     the two apart from the log alone. */
  console.log(
    `[orchestrator] POST ${url} auth=${secret ? "present" : "MISSING"} ` +
      `body=${JSON.stringify({
        tier: payload.tier,
        model: payload.model,
        messages: `[${payload.messages.length} messages]`,
      })}`,
  );
  if (!payload.model) {
    console.warn(
      "[orchestrator] model is empty — the orchestrator will log MODEL picked='' " +
        "and ignore the picker. Every caller should pass a display name.",
    );
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-DAP-Auth": secret,
      },
      /* model is the picked model's display name, which is what the
         orchestrator routes on. Without it the orchestrator logged
         MODEL picked='' and fell back to a default, so the picker in the
         UI selected a model that never reached the hardware. */
      body: JSON.stringify(payload),
      signal: opts.signal,
      // Never follow a redirect. The runtime keeps custom headers across a
      // cross-origin redirect, so a 3xx from the tunnel host would re-send
      // X-DAP-Auth (the shared inference secret) to wherever it points. The
      // orchestrator answers 200 with a stream in normal operation, so this
      // changes nothing there — it only turns a redirect into the graceful
      // "offline" path below instead of a secret disclosure.
      redirect: "manual",
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === "AbortError") throw err;
    console.error(`[orchestrator] request failed: ${err.name}: ${err.message}`);
    throw new OrchestratorUnavailableError();
  }
  if (!res.ok || !res.body) {
    const detail = res.body ? (await res.text()).slice(0, 300) : "no body";
    console.error(
      `[orchestrator] HTTP ${res.status}: ${detail.replace(/\s+/g, " ").trim()}`
    );
    throw new OrchestratorUnavailableError();
  }
  return res;
}

/**
 * Parse an SSE body into orchestrator events, and report how it ended.
 *
 * A generation that dies part-way looks identical from outside to one that
 * never started: the caller just never sees "done". The number that tells
 * them apart is how long the orchestrator went quiet before the connection
 * closed. A long silence then a close is an idle timeout in the tunnel; a
 * close right after the last token is the orchestrator giving up. Neither
 * is visible unless it is measured here.
 */
export async function* readOrchestratorEvents(
  res: Response
): AsyncGenerator<OrchestratorEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const startedAt = Date.now();
  let lastEventAt = startedAt;
  let lastKind = "nothing";
  let tokens = 0;
  let sawDone = false;

  const report = () => {
    const secs = (ms: number) => Math.round(ms / 100) / 10;
    const total = secs(Date.now() - startedAt);
    const silent = secs(Date.now() - lastEventAt);
    const head =
      `[orchestrator] stream ${sawDone ? "completed" : "ENDED WITHOUT done"} ` +
      `after ${total}s: ${tokens} token(s), last event ${lastKind}, ` +
      `quiet for ${silent}s before it closed`;
    if (sawDone) console.log(head);
    else
      console.error(
        `${head} — a long quiet stretch here is an idle timeout between us and the orchestrator, not a refusal`,
      );
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          if (payload === "[DONE]") {
            sawDone = true;
            lastEventAt = Date.now();
            lastKind = "done";
            yield { type: "done" };
          }
          continue;
        }
        try {
          const evt = JSON.parse(payload) as OrchestratorEvent;
          if (evt && typeof evt.type === "string") {
            lastEventAt = Date.now();
            if (evt.type === "token") {
              tokens += 1;
              lastKind = "token";
            } else {
              lastKind = evt.type === "status" ? `status:${evt.stage}` : evt.type;
              if (evt.type === "done") sawDone = true;
            }
            yield evt;
          }
        } catch {
          /* ignore keep-alive / malformed frames */
        }
      }
    }
  } finally {
    report();
  }
}

/**
 * Non-streaming convenience wrapper: run a turn and return the whole reply.
 * Used by short internal tasks (flashcards, study rooms, the fallback
 * server-function path).
 */
export async function orchestratorComplete(opts: {
  tier: string;
  /** Display name of the model the sender picked, e.g. "DAP AI 4 Lite". */
  model?: string;
  messages: OrchestratorMessage[];
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 180_000);
  try {
    const res = await openOrchestratorStream({
      tier: opts.tier,
      model: opts.model,
      messages: opts.messages,
      signal: ctrl.signal,
    });
    let text = "";
    let finished = false;
    for await (const evt of readOrchestratorEvents(res)) {
      if (evt.type === "token") text += evt.text ?? "";
      else if (evt.type === "done") {
        finished = true;
        break;
      } else if (evt.type === "error") {
        console.error(`[orchestrator] error event: ${evt.message}`);
        throw new OrchestratorUnavailableError();
      }
    }
    if (!finished && !text.trim()) {
      throw new OrchestratorUnavailableError(CONNECTION_LOST_MESSAGE);
    }
    return text;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
