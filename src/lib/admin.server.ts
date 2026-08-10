import { dbError } from "./db-error";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_EMAIL = "pancholiadevansh@gmail.com";

export function getAdminClient() {
  return supabaseAdmin;
}

export async function assertAdmin(userId: string) {
  const { data: authUser, error: authErr } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (authErr) throw dbError(authErr);

  const email = authUser?.user?.email?.toLowerCase() ?? "";
  if (email !== ADMIN_EMAIL) throw new Error("Forbidden: admin role required");

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new Error("Forbidden: admin role required");
}