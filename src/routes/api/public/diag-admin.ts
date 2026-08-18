import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/diag-admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const email =
          new URL(request.url).searchParams.get("email") ?? "nobody@example.com";
        const out: Record<string, unknown> = {};
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const list = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        out["listUsers"] = {
          count: list.data?.users?.length ?? null,
          error: list.error
            ? {
                status: (list.error as { status?: number }).status,
                message: list.error.message,
                body: JSON.stringify(
                  list.error,
                  Object.getOwnPropertyNames(list.error)
                ),
              }
            : null,
        };
        try {
          const { generateSignupLink } = await import("@/lib/signup.server");
          const link = await generateSignupLink({
            email,
            password: "Testpass!2345",
            name: "Diag",
            origin: "http://localhost:8080",
          });
          out["link"] = link.slice(0, 60);
        } catch (e) {
          out["linkError"] = {
            name: (e as Error).name,
            message: (e as Error).message,
            body: JSON.stringify(e, Object.getOwnPropertyNames(e as object)),
          };
        }
        return new Response(JSON.stringify(out, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
