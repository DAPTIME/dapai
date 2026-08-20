/**
 * One friendly sentence for every "the AI backend can't be reached" case.
 *
 * Users should never see tunnel URLs, ngrok error codes, HTTP statuses or
 * environment variable names — those go to the server log instead.
 */
export const OFFLINE_FALLBACK = "Sorry, DAP AI is offline right now.";

/**
 * The backend did not answer — which is not the same as being switched off.
 *
 * These two were saying the same thing, and the thing they said was the
 * admin's maintenance notice. So when the hardware or the tunnel went down,
 * everyone including the admin was shown "DAP AI is adding DAP AI 4.0,
 * check back later" — a sentence that describes a decision somebody made.
 * The natural next move is to open the admin panel, find every switch on,
 * and conclude the switches are broken.
 *
 * Anything reaching this point has already passed the site switch, the
 * AI-enabled switch and the model's own flag, so it is true to say that
 * nothing is turned off: what failed is the reaching.
 */
export const BACKEND_UNREACHABLE =
  "DAP AI can't reach its hardware right now. Nothing is switched off — " +
  "please try again in a moment.";

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
