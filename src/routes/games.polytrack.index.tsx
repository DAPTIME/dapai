// The game moved from /games/polytrack to /games/daptrack. Links that
// were already shared keep working through this redirect.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/games/polytrack/")({
  beforeLoad: () => {
    throw redirect({ to: "/games/daptrack", replace: true });
  },
});
