import { dbError } from "./db-error";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function getAdminClient() {
  return supabaseAdmin;
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
  // Admin is whoever holds an "admin" row in public.user_roles, so the owner
  // can promote/demote people straight from Supabase.
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw dbError(error, "isAdminUser");
  return !!data;
}

export async function assertAdmin(userId: string) {
  if (!(await isAdminUser(userId))) {
    throw new Error("Forbidden: admin role required");
  }
}
