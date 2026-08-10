/**
 * Database error sanitiser.
 *
 * Postgres/Supabase error messages routinely embed internal identifiers —
 * table names, column names, constraint names, RLS policy names. Server
 * functions used to rethrow `error.message` verbatim, and TanStack Start
 * serialises that straight back to the browser, handing an attacker a map
 * of the schema.
 *
 * Instead: log the real error on the server, return a generic message to
 * the caller. Deliberately authored user-facing validation messages should
 * be thrown directly (`throw new Error("Track name is too short")`), not
 * routed through here.
 */

export const GENERIC_DB_ERROR =
  "Something went wrong, please try again.";

type MaybeError = { message?: string; code?: string; details?: string } | null | undefined;

/** Log the real database error server-side; return a safe Error for the client. */
export function dbError(error: MaybeError, context?: string): Error {
  try {
    console.error(
      `[db]${context ? ` ${context}:` : ""}`,
      error?.code ? `(${error.code}) ` : "",
      error?.message ?? "unknown error",
      error?.details ?? "",
    );
  } catch {
    /* logging must never break the request */
  }
  return new Error(GENERIC_DB_ERROR);
}
