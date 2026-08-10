/**
 * The public half of the Supabase configuration, for server code.
 *
 * The project URL and the publishable (anon) key are not secrets. The
 * anon key is designed to be handed to browsers and is guarded by
 * row-level security; both are already compiled into the client bundle
 * by client.ts, so anyone can read them from the shipped JavaScript.
 *
 * They live here because .env is no longer tracked in git. Server code
 * used to read them straight from process.env, which was fine while a
 * committed .env supplied them — but with the file untracked, a deploy
 * that has not had the variables set by hand would leave the auth
 * middleware, the admin client, the leaderboard, the chat API and the
 * MCP definition all reading undefined. An outage is a poor trade for a
 * value that is public anyway.
 *
 * So: the environment wins where it is set, and these fall back to the
 * same literals client.ts already carries. Nothing secret belongs in
 * this file. SUPABASE_SERVICE_ROLE_KEY in particular is a real secret,
 * bypasses row-level security, and stays environment-only.
 */

const FALLBACK_URL = "https://ydjuoqizridueiuxnbqk.supabase.co";
const FALLBACK_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkanVvcWl6cmlkdWVpdXhuYnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMDAxMTAsImV4cCI6MjA5NTg3NjExMH0.UifwNWbDbMdUYtQtNI83CCM_rTA7WA9DEjDQUwz3hx0";

/** Project URL. Environment first, then the value client.ts ships with. */
export const SUPABASE_URL = process.env.SUPABASE_URL || FALLBACK_URL;

/** Publishable (anon) key. Public by design; RLS is what protects data. */
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;
