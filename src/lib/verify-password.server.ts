/**
 * Verifies a user's *current* password server-side without touching their
 * active session. Uses a throwaway publishable-key client with no session
 * persistence, so a successful check has no side effects.
 */
import { createClient } from "@supabase/supabase-js";

export async function verifyCurrentPassword(email: string, password: string) {
  const url = process.env["SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) {
    throw new Error("Password verification is temporarily unavailable.");
  }
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) return false;
  // Immediately drop the throwaway session.
  await client.auth.signOut({ scope: "local" }).catch(() => {});
  return true;
}
