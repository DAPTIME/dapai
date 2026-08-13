// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      mcpPlugin(),
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        filename: "sw.js",
        // src/lib/register-sw.ts is the only registrar (guarded for previews).
        injectRegister: null,
        // Never emit a service worker in dev or Lovable preview.
        devOptions: { enabled: false },
        // We ship a hand-authored manifest at public/manifest.webmanifest.
        manifest: false,
        includeAssets: [
          "favicon.png",
          "offline.html",
          "manifest.webmanifest",
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/icon-maskable-512.png",
          "icons/apple-touch-icon.png",
        ],
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,webmanifest,woff,woff2}"],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: "/offline.html",
          // Auth, API and Supabase traffic (including streaming chat) must
          // never be intercepted or cached by the worker.
          navigateFallbackDenylist: [/\/api\//, /\/functions\//, /supabase/, /\/auth/, /\/~oauth/],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" &&
                url.origin === self.location.origin &&
                !/\/api\/|\/functions\/|supabase|\/auth|\/~oauth/.test(url.pathname),
              handler: "NetworkFirst",
              options: {
                cacheName: "dap-pages-v1",
                networkTimeoutSeconds: 5,
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: ({ request, url }) =>
                url.origin === self.location.origin &&
                ["style", "script", "font", "image"].includes(request.destination),
              handler: "CacheFirst",
              options: {
                cacheName: "dap-assets-v1",
                expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  },
});

