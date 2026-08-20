/**
 * A reply the user interrupted keeps a marker on the end so the model can
 * see, on the next turn, that its previous answer was cut off by the person
 * rather than finished. The marker is never shown in the UI — it is stripped
 * from anything rendered — but it stays in the stored text, which is exactly
 * what the orchestrator receives as history.
 */
export const CUTOFF_MARKER = "*()user_intrupted_responce()*";

/**
 * Everything the UI must hide from a stopped reply.
 *
 * Two dead markers are kept here on purpose: replies stopped before the
 * wording settled are already stored with them, and dropping them from
 * this list would make old messages start displaying their marker.
 */
const HIDDEN = [
  CUTOFF_MARKER,
  "*()message_got_cutoof_by_user()*",
  "_Stopped._",
];

/** Did this stored message end in an interruption? */
export function wasCutOff(content: string): boolean {
  return HIDDEN.some((h) => content.includes(h));
}

/** The visible text of a message: markers removed, whitespace tidied. */
export function stripCutoffMarker(content: string): string {
  let out = content;
  for (const h of HIDDEN) out = out.split(h).join("");
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}
