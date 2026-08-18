import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** A client carrying the caller's own JWT — not the service-role one. */
type CallerClient = SupabaseClient<Database>;

export function getAdminClient() {
  return supabaseAdmin;
}

/** Why an admin check could not be answered. */
export type AdminCheckProblem = "config" | "database";

/**
 * Thrown when the check itself failed, as opposed to succeeding with "no".
 * `detail` is safe to show a signed-in caller: an env var name or a Postgres
 * error code, never a message that maps out the schema. The full error goes
 * to the server log.
 */
export class AdminCheckError extends Error {
  constructor(
    readonly problem: AdminCheckProblem,
    readonly detail: string,
  ) {
    super(`admin check failed (${problem}): ${detail}`);
    this.name = "AdminCheckError";
  }
}

/**
 * Does this account hold the admin role?
 *
 * Separated from assertAdmin so that "you are not an admin" and "the check
 * could not run" stay distinguishable. A missing SUPABASE_SERVICE_ROLE_KEY or
 * an unreachable database throws out of here; only a clean query that found
 * no row returns false. The console used to catch everything and render
 * "your account is not authorized", which is a lie when the real problem is
 * a server that never managed to ask.
 */
export async function isAdminUser(
  userId: string,
  caller?: CallerClient
): Promise<boolean> {
  /* Ask through the caller's own client first, when there is one.
     site_admin lives on the account's own profile row, which RLS already
     lets that account read — the auth middleware reads `banned` the same
     way, for the same stated reason. Going through the service role to
     answer "am I an admin?" made the whole console depend on
     SUPABASE_SERVICE_ROLE_KEY being configured, so a deployment missing it
     could not even find out who was looking, and every read failed with
     "admin check failed (config)".

     A clean answer here is authoritative, true or false: the row belongs to
     the caller, and the privilege-guard trigger stops them writing
     site_admin. Only if this path errors do we fall through to the service
     role, so a project whose RLS differs still behaves as it did. */
  if (caller) {
    const { data, error } = await caller
      .from("profiles")
      .select("site_admin")
      .eq("id", userId)
      .maybeSingle();
    if (!error && data) return data.site_admin === true;
    if (error) {
      console.warn(
        "[admin] own-profile role lookup failed, trying service role:",
        error.code ?? "unknown"
      );
    }
  }

  try {
    // Admin is the site_admin checkbox on the account's profile row — one
    // column, tickable straight from the Supabase table editor. A trigger
    // mirrors it into user_roles, which is what the RLS policies read, but
    // this is the source of truth and the only thing the console consults.
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("site_admin")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[admin] role lookup failed:", error.code, error.message, error.details);
      throw new AdminCheckError("database", error.code ?? "unknown");
    }
    return data?.site_admin === true;
  } catch (e) {
    if (e instanceof AdminCheckError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin] role lookup threw:", message);
    // client.server.ts throws this exact phrase when the service role key or
    // the project URL is absent from the deployment environment.
    if (message.includes("Missing Supabase environment variable")) {
      throw new AdminCheckError("config", "SUPABASE_SERVICE_ROLE_KEY");
    }
    throw new AdminCheckError("database", "unreachable");
  }
}

export async function assertAdmin(userId: string, caller?: CallerClient) {
  if (!(await isAdminUser(userId, caller))) {
    throw new Error("Forbidden: admin role required");
  }
}
