/**
 * Game-frame relay for "unblock mode" — see src/lib/px-relay.server.ts.
 *
 * The provider's player reads the game name from the FIRST segment of
 * location.pathname, so relayed game frames are served from
 *
 *   /<game-slug>/px/https/play.gamepix.com/<game-slug>/embed
 *
 * which keeps that lookup working while still coming from our own origin.
 */
import { createFileRoute } from "@tanstack/react-router";

const splatOf = (params: unknown) => (params as { _splat?: string })._splat ?? "";
const prefixOf = (params: unknown) =>
  `/${encodeURIComponent((params as { gameHint?: string }).gameHint ?? "game")}/px`;

export const Route = createFileRoute("/$gameHint/px/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleRelay } = await import("@/lib/px-relay.server");
        return handleRelay(request, splatOf(params), "GET", prefixOf(params));
      },
      HEAD: async ({ request, params }) => {
        const { handleRelay } = await import("@/lib/px-relay.server");
        return handleRelay(request, splatOf(params), "HEAD", prefixOf(params));
      },
      POST: async ({ request, params }) => {
        const { handleRelay } = await import("@/lib/px-relay.server");
        return handleRelay(request, splatOf(params), "POST", prefixOf(params));
      },
    },
  },
});
