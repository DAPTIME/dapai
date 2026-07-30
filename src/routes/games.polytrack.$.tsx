// Catch-all for the old /games/polytrack/* URLs — editor, browse and,
// most importantly, shared /track/<id> links — so nothing that was
// already sent out 404s after the move to /games/daptrack.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/games/polytrack/$")({
  beforeLoad: ({ params }) => {
    const rest = (params as { _splat?: string })._splat ?? "";
    throw redirect({ href: `/games/daptrack/${rest}`, replace: true });
  },
});
