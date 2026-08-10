import { dbError } from "./db-error";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function getAdminClient() {
  return supabaseAdmin;
}

export async function assertAdmin(userId: string) {
  // Admin is whoever holds an "admin" row in public.user_roles, so the owner
  // can promote/demote people straight from Supabase.
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new Error("Forbidden: admin role required");
}