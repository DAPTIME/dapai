import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-driven cleanup: hard-deletes any chat whose `updated_at` is older
 * than 7 days. Triggered daily at 00:00 GST (= 20:00 UTC) by pg_cron.
 *
 * Called by Supabase pg_cron with the project's anon key in the
 * `apikey` header — we verify it matches `SUPABASE_PUBLISHABLE_KEY`
 * before doing anything. chat_messages cascades on delete.
 */
export const Route = createFileRoute("/api/public/hooks/cleanup-old-chats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apikey || !expected || apikey !== expected) {
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
            return Response.json(
              { ok: false, error: error.message },
              { status: 500 }
            );
          }
          return Response.json({ ok: true, deleted: data?.length ?? 0, cutoff });
        } catch (e) {
          return Response.json(
            { ok: false, error: (e as Error).message },
            { status: 500 }
          );
        }
      },
    },
  },
});
