/**
 * Asset relay for "unblock mode" — see src/lib/px-relay.server.ts.
 * Used for thumbnails and any provider asset that does not care about the
 * page path it is served from.
 */
import { createFileRoute } from "@tanstack/react-router";

const PREFIX = "/api/public/px";

const splatOf = (params: unknown) => (params as { _splat?: string })._splat ?? "";

export const Route = createFileRoute("/api/public/px/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleRelay } = await import("@/lib/px-relay.server");
        return handleRelay(request, splatOf(params), "GET", PREFIX);
      },
      HEAD: async ({ request, params }) => {
        const { handleRelay } = await import("@/lib/px-relay.server");
        return handleRelay(request, splatOf(params), "HEAD", PREFIX);
      },
      POST: async ({ request, params }) => {
        const { handleRelay } = await import("@/lib/px-relay.server");
        return handleRelay(request, splatOf(params), "POST", PREFIX);
      },
    },
  },
});
