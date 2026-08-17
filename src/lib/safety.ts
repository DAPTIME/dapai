/**
 * Recognising a safety refusal from the orchestrator.
 *
 * Whatever the upstream says — a content-filter finish reason, an HTTP
 * error naming its guard model, a moderation envelope — the person on the
 * other end sees one fixed sentence. Two reasons for that: the upstream
 * wording changes with the model and would leak which guard is running,
 * and a refusal phrased differently each time reads as a fault rather
 * than as a rule.
 *
 * The string is defined in usage-limits.ts alongside the other fixed copy
 * and re-exported here so a caller handling a block has one import.
 */
export { SAFETY_BLOCKED_MESSAGE } from "@/lib/usage-limits";

/** Shape of the bits of an OpenAI-style completion that signal a block. */
type Completionish = {
  choices?: Array<{ finish_reason?: string | null; message?: unknown }>;
  error?: string | { message?: string; code?: string; type?: string } | null;
  // Some guards answer with their own envelope rather than a completion.
  blocked?: boolean;
  flagged?: boolean;
  results?: Array<{ flagged?: boolean }>;
};

/**
 * Wording used by guard layers when they refuse. Matched on the upstream's
 * own error text, never on the model's prose — a model discussing content
 * policy in an answer is not a refusal, and treating it as one would
 * replace a legitimate reply with the refusal notice.
 */
const GUARD_WORDING =
  /\b(content[_ -]?filter|content[_ -]?polic|safety[_ -]?(filter|system|polic)|moderation|guardrail|llama[_ -]?guard|flagged as (unsafe|harmful)|blocked by|refus(ed|al) by (the )?(safety|guard))/i;

/**
 * Did the orchestrator refuse this on safety grounds?
 *
 * `status` is the HTTP status; a 4xx carrying guard wording is a block,
 * whereas the same wording on a 200 needs the structured signal, because
 * on a 200 the text could just be the answer.
 */
export function isSafetyBlock(json: unknown, status = 200): boolean {
  const body = (json ?? {}) as Completionish;

  if (body.blocked === true || body.flagged === true) return true;
  if (Array.isArray(body.results) && body.results.some((r) => r?.flagged)) {
    return true;
  }

  const finish = body.choices?.[0]?.finish_reason;
  if (typeof finish === "string" && /content[_ -]?filter|safety/i.test(finish)) {
    return true;
  }

  const err = body.error;
  const errText =
    typeof err === "string" ? err : (err?.message ?? err?.code ?? err?.type ?? "");
  if (errText && GUARD_WORDING.test(errText)) return true;

  // A refusal delivered as a plain 4xx with nothing machine-readable in it.
  if (status >= 400 && status < 500 && typeof json === "string") {
    return GUARD_WORDING.test(json);
  }

  return false;
}
