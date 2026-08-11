import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    // Admin is whoever holds an "admin" row in public.user_roles, so the
    // owner can promote and demote people straight from Supabase.
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (error) {
      console.error("[admin] role lookup failed:", error.code, error.message, error.details);
      throw new AdminCheckError("database", error.code ?? "unknown");
    }
    return !!data;
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

export async function assertAdmin(userId: string) {
  if (!(await isAdminUser(userId))) {
    throw new Error("Forbidden: admin role required");
  }
}
