import { createFileRoute } from "@tanstack/react-router";

/**
 * Server relay for DAP AI.
 *
 * Set AI_BACKEND_URL (and optional AI_BACKEND_KEY) as a secret.
 * Point it at your PC via a tunnel:
 *   - ngrok:        ngrok http 11434  ->  https://xxxx.ngrok-free.app/v1/chat/completions
 *   - cloudflared:  cloudflared tunnel --url http://localhost:11434
 *
 * The body is forwarded as-is (OpenAI chat-completions shape).
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const backend = process.env.AI_BACKEND_URL;
        if (!backend) {
          return Response.json(
            {
              error:
                "No AI backend configured. Set AI_BACKEND_URL to your PC's tunnel URL.",
            },
            { status: 503 }
          );
        }
        const key = process.env.AI_BACKEND_KEY;
        const body = await request.text();
        try {
          const res = await fetch(backend, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
            },
            body,
          });
          const text = await res.text();
          return new Response(text, {
            status: res.status,
            headers: {
              "Content-Type":
                res.headers.get("content-type") ?? "application/json",
            },
          });
        } catch (e) {
          return Response.json(
            { error: `Could not reach AI_BACKEND_URL: ${(e as Error).message}` },
            { status: 502 }
          );
        }
      },
    },
  },
});
