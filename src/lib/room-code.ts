/**
 * Room codes are uppercase alphanumerics (e.g. "E2EE27"), but they reach us
 * through however a person got them to their keyboard: pasted out of a chat
 * message with a trailing newline, typed with the spaces the letter-spaced
 * input seems to invite, autocapitalised or not by a phone keyboard, or
 * carrying a zero-width character from a messaging app.
 *
 * Every one of those reads to the user as "the code is right and joining is
 * broken", so normalisation happens in one place and is applied on both sides
 * of the wire: the input as you type, and the server before it queries.
 */
export function normalizeRoomCode(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 10);
}
