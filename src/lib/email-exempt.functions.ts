/**
 * Admin-managed allowlist of email addresses that are never rate limited
 * when the app sends account emails (signup confirmation, password reset).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, getAdminClient } from "@/lib/admin.server";
import { dbError } from "./db-error";

export const adminListEmailExempt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await getAdminClient()
      .from("email_rate_limit_exempt")
      .select("id, email, note, created_at")
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
    return data ?? [];
  });

export const adminAddEmailExempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        email: z
          .string()
          .trim()
          .email({ message: "Please enter a valid email address." })
          .max(255),
        note: z.string().trim().max(200).optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await getAdminClient()
      .from("email_rate_limit_exempt")
      .upsert(
        {
          email: data.email.toLowerCase(),
          note: data.note ?? "",
          created_by: context.userId,
        },
        { onConflict: "email" }
      );
    if (error) throw dbError(error);
    return { ok: true };
  });

export const adminRemoveEmailExempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await getAdminClient()
      .from("email_rate_limit_exempt")
      .delete()
      .eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true };
  });
