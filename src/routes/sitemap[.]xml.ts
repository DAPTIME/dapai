import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Set SITE_URL in the deployment environment when a custom domain is
// pointed at the site. Every <loc> has to be on the domain being indexed —
// a sitemap that advertises lovable.app URLs from dapai.com is ignored.
const BASE_URL = (process.env.SITE_URL || "https://dapai.lovable.app").replace(
  /\/+$/,
  "",
);

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/about-dap-ai", changefreq: "weekly", priority: "0.9" },
          { path: "/daps", changefreq: "weekly", priority: "0.8" },
          { path: "/help", changefreq: "monthly", priority: "0.5" },
          { path: "/team", changefreq: "monthly", priority: "0.5" },
          // The arcade was missing entirely. These are real pages with real
          // content, and they are the ones people search for by name —
          // nobody googles "AI workspace", plenty of people google the name
          // of a game.
          { path: "/rooms", changefreq: "weekly", priority: "0.7" },
          { path: "/games", changefreq: "weekly", priority: "0.7" },
          { path: "/games/daptrack", changefreq: "weekly", priority: "0.7" },
          { path: "/games/daptrack/browse", changefreq: "weekly", priority: "0.5" },
          { path: "/games/2048", changefreq: "monthly", priority: "0.4" },
          { path: "/games/snake", changefreq: "monthly", priority: "0.4" },
          { path: "/games/breakout", changefreq: "monthly", priority: "0.4" },
          { path: "/games/flappy", changefreq: "monthly", priority: "0.4" },
          { path: "/games/river", changefreq: "monthly", priority: "0.4" },
          { path: "/games/spacewar", changefreq: "monthly", priority: "0.4" },
          { path: "/terms", changefreq: "yearly", priority: "0.3" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n")
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
