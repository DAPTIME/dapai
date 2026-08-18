/**
 * The service-role client, as something that can be absent.
 *
 * `supabaseAdmin` in client.server.ts (Lovable-generated, not edited here)
 * throws on first use when SUPABASE_SERVICE_ROLE_KEY is not configured.
 * That is the right behaviour for callers that cannot proceed without it —
 * and the wrong one for every path that has a reasonable degradation:
 * tonight the deployed environment was missing the key, and the throw took
 * signup, chat and the admin console down with it, each dying mid-handler
 * with an environment dump in the user's toast.
 *
 * Callers that can degrade use tryAdminClient() and decide what "without
 * it" means for them: a skipped kill-switch read, a soft delete instead of
 * a hard one, an empty leaderboard. Callers that genuinely cannot proceed
 * keep importing supabaseAdmin directly and fail loudly, which is correct.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function hasAdminEnv(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

let warned = false;

/** The service-role client, or null when the deployment has no key. */
export async function tryAdminClient(): Promise<SupabaseClient<Database> | null> {
  if (!hasAdminEnv()) {
    if (!warned) {
      warned = true;
      console.warn(
        "[admin-client] SUPABASE_SERVICE_ROLE_KEY is not set; running with degraded fallbacks. " +
          "Set it in the deployment environment to restore full behaviour."
      );
    }
    return null;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
