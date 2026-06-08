import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reuse cached data for 30s so revisiting a page is instant
        // instead of refetching on every mount.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route code + data as soon as a link enters the viewport
    // (or on hover/focus) so navigation feels instantaneous.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPreloadDelay: 0,
    // Skip the brief "loading" flash for fast loads.
    defaultPendingMs: 200,
    defaultPendingMinMs: 0,
  });

  return router;
};
