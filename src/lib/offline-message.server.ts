/**
 * One friendly sentence for every "the AI backend can't be reached" case.
 *
 * Users should never see tunnel URLs, ngrok error codes, HTTP statuses or
 * environment variable names — those go to the server log instead.
 */
export const OFFLINE_FALLBACK = "Sorry, DAP AI is offline right now.";

/** The admin-authored offline notice, falling back to the sentence above. */
export async function offlineMessage(): Promise<string> {
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data } = await supabaseAdmin
      .from("ai_settings")
      .select("system_prompt")
      .eq("id", "offline_message")
      .maybeSingle();
    const msg = (data?.system_prompt ?? "").trim();
    return msg || OFFLINE_FALLBACK;
  } catch {
    return OFFLINE_FALLBACK;
  }
}
