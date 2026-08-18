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
      new Error("trace").stack,
    );
  } catch {
    /* logging must never break the request */
  }
  return new Error(GENERIC_DB_ERROR);
}

/**
 * Postgres describing its own internals, as opposed to a message we wrote.
 *
 * Several of our triggers and RPCs raise messages meant to be read by the
 * person who hit them ("You have used all of today's usage tokens"), and
 * those should survive. But they arrive through the same channel as
 * `permission denied for table profiles` and `new row for relation
 * "custom_tracks" violates check constraint "custom_tracks_quota"`, which
 * hand over the schema a piece at a time.
 *
 * Matching on the error code is not enough — a trigger can raise with any
 * ERRCODE it likes, and Postgres reuses the same codes for its own faults.
 * So the test is the wording: anything that reads like the database talking
 * about itself is replaced, whatever code it came with.
 */
const POSTGRES_WORDING =
  /\b(relation|column|constraint|policy|schema|table|function|operator|type|role)\s+"|permission denied|violates |does not exist|already exists|syntax error|invalid input syntax|duplicate key|null value in column|foreign key|schema cache|search_path|pg_[a-z_]+|SQLSTATE/i;

/**
 * Return a message only if we wrote it; otherwise the generic one.
 *
 * Use at call sites that deliberately surface a database-raised message.
 * The real error is always logged either way.
 */
export function userFacingError(error: MaybeError, context?: string): Error {
  const message = error?.message?.trim();

  // A message we authored is one line and reads like English. Multi-line or
  // very long output is Postgres including context, hints, or a query.
  const looksAuthored =
    !!message &&
    message.length > 0 &&
    message.length <= 200 &&
    !message.includes("\n") &&
    !POSTGRES_WORDING.test(message);

  if (looksAuthored) return new Error(message);
  return dbError(error, context);
}
