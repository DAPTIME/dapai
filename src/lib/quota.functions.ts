/**
 * Usage-token / image quota reads for the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("tier")
      .eq("id", userId)
      .maybeSingle();
    const { getQuotaSnapshot } = await import("@/lib/quota.server");
    return getQuotaSnapshot(userId, (data?.tier as string) ?? "free");
  });
