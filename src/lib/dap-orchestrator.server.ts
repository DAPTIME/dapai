/**
 * The one and only AI backend: the DAP orchestrator.
 *
 * Every reply the site produces goes through a single server-side call:
 *
 *   POST {DAP_ORCHESTRATOR_URL}/v1/chat
 *   X-DAP-Auth: {DAP_SHARED_SECRET}
 *   { "tier": "free" | "go" | "pro" | "exclusive", "messages": [...] }
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
      .eq("id", "ai_enabled")
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
  messages: OrchestratorMessage[];
  signal?: AbortSignal;
}): Promise<Response> {
  const { url, secret } = orchestratorConfig();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-DAP-Auth": secret,
      },
      body: JSON.stringify({
        tier: opts.tier || "free",
        messages: opts.messages,
      }),
      signal: opts.signal,
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

/** Parse an SSE body into orchestrator events. */
export async function* readOrchestratorEvents(
  res: Response
): AsyncGenerator<OrchestratorEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
        if (payload === "[DONE]") yield { type: "done" };
        continue;
      }
      try {
        const evt = JSON.parse(payload) as OrchestratorEvent;
        if (evt && typeof evt.type === "string") yield evt;
      } catch {
        /* ignore keep-alive / malformed frames */
      }
    }
  }
}

/**
 * Non-streaming convenience wrapper: run a turn and return the whole reply.
 * Used by short internal tasks (flashcards, study rooms, the fallback
 * server-function path).
 */
export async function orchestratorComplete(opts: {
  tier: string;
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
