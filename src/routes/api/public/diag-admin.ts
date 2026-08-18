import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/diag-admin")({
  server: {
    handlers: {
      GET: async () => {
        const out: Record<string, unknown> = {
          hasKey: !!process.env["SUPABASE_SERVICE_ROLE_KEY"],
          keyPrefix: (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").slice(0, 3),
          url: process.env["SUPABASE_URL"] ?? null,
        };
        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 200,
          });
          out["users"] = data?.users?.length ?? null;
          out["error"] = error
            ? {
                name: error.name,
                status: (error as { status?: number }).status,
                message: error.message,
                code: (error as { code?: string }).code,
                keys: Object.getOwnPropertyNames(error),
              }
            : null;
        } catch (e) {
          out["threw"] = {
            name: (e as Error).name,
            message: (e as Error).message,
            cause: String((e as { cause?: unknown }).cause ?? ""),
          };
        }
        return new Response(JSON.stringify(out, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
