import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listBetaTesters = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("beta_testers")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
);

const ADMIN_EMAIL = "pancholiadevansh@gmail.com";

async function assertAdmin(userId: string) {
  const { data: authUser, error: authErr } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (authErr) throw new Error(authErr.message);
  const email = authUser?.user?.email?.toLowerCase() ?? "";
  if (email !== ADMIN_EMAIL) throw new Error("Forbidden: admin role required");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const adminAddBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ name: z.string().trim().min(1).max(120) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("beta_testers")
      .insert({ name: data.name, sort_order: 999 });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRemoveBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("beta_testers")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
