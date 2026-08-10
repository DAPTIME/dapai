import { dbError } from "./db-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, getAdminClient } from "@/lib/admin.server";

export const listBetaTesters = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from("beta_testers")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw dbError(error);
    return data ?? [];
  },
);

export const adminAddBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ name: z.string().trim().min(1).max(120) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin
      .from("beta_testers")
      .insert({ name: data.name, sort_order: 999 });
    if (error) throw dbError(error);
    return { ok: true };
  });

export const adminRemoveBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin
      .from("beta_testers")
      .delete()
      .eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true };
  });
