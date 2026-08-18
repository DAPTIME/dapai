import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/diag-admin")({
  server: {
    handlers: {
      GET: async () => {
        const out: Record<string, unknown> = {};
        try {
          const { orchestratorConfig, orchestratorComplete, aiEnabled } =
            await import("@/lib/dap-orchestrator.server");
          const cfg = orchestratorConfig();
          out["url"] = cfg.url;
          out["aiEnabled"] = await aiEnabled();
          const started = Date.now();
          const text = await orchestratorComplete({
            tier: "free",
            messages: [{ role: "user", content: "Say the word ready." }],
            timeoutMs: 120_000,
          });
          out["ms"] = Date.now() - started;
          out["reply"] = text.slice(0, 200);
        } catch (e) {
          out["error"] = { name: (e as Error).name, message: (e as Error).message };
        }
        return new Response(JSON.stringify(out, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
