import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-driven cleanup: hard-deletes any chat whose `updated_at` is older
 * than 7 days. Triggered daily at 00:00 GST (= 20:00 UTC) by pg_cron.
 * chat_messages cascades on delete.
 *
 * ── On the shared secret ────────────────────────────────────────────────
 *
 * This used to authenticate by comparing the `apikey` header against
 * SUPABASE_PUBLISHABLE_KEY. That key is published — it is compiled into
 * the browser bundle by design — so the check amounted to asking the caller
 * to repeat something anyone can read, and an unauthenticated stranger
 * could fire a destructive endpoint at will.
 *
 * CLEANUP_HOOK_SECRET is the real check. Until it is set the old comparison
 * still applies, so the existing cron keeps running rather than the cleanup
 * silently stopping — but set it, and the weak path is gone.
 */
function safeEqual(a: string, b: string) {
  // Compare in constant time: a plain === returns early on the first wrong
  // character, which leaks the secret a byte at a time to anyone timing it.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/cleanup-old-chats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Fail closed. This endpoint hard-deletes every chat older than a
        // week, so its auth must be a real secret. The previous fallback —
        // "if CLEANUP_HOOK_SECRET is unset, accept the publishable key
        // instead" — accepted a value that ships in the browser bundle, so
        // a deployment that forgot the secret let anyone delete week-old
        // chats. No secret configured now means the hook refuses to run
        // rather than trusting a public value.
        const secret = process.env.CLEANUP_HOOK_SECRET ?? "";
        if (!secret) {
          console.error(
            "[cleanup] CLEANUP_HOOK_SECRET is not set; refusing to run. " +
              "Set it to enable the cleanup hook."
          );
          return new Response("Cleanup hook not configured", { status: 503 });
        }
        const offered =
          request.headers.get("x-cleanup-secret") ??
          request.headers.get("apikey") ??
          "";
        if (!safeEqual(offered, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabaseAdmin
            .from("chats")
            .delete()
            .lt("updated_at", cutoff)
            .select("id");
          if (error) {
            // The detail goes to the log, not down the wire — this response
            // is reachable by anyone who guesses the secret wrong once.
            console.error("[cleanup] delete failed:", error.code, error.message);
            return Response.json({ ok: false }, { status: 500 });
          }
          return Response.json({ ok: true, deleted: data?.length ?? 0, cutoff });
        } catch (e) {
          console.error("[cleanup] threw:", e instanceof Error ? e.message : e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
