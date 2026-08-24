import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gamepad2 } from "lucide-react";

import { AdBanner } from "@/components/ads/ad-banner";
import { topGames, GAME_CATALOG } from "@/lib/game-catalog";
import logo from "@/assets/logo.png.asset.json";

const HOME_DESCRIPTION =
  "DAP Games — a free browser arcade. Play 2048, Snake, Brick Breaker, Flappy, River Crosser and race in DAP Track, our 3D time-trial game with a track editor.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DAP Games — Free Browser Games & DAP Track" },
      { name: "description", content: HOME_DESCRIPTION },
      { name: "keywords", content: "DAP Games, free browser games, DAP Track, online arcade, 2048, snake" },
      { property: "og:title", content: "DAP Games — Free Browser Games & DAP Track" },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dapgames.lovable.app/" },
      { property: "og:image", content: "https://dapgames.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "DAP Games — Free Browser Games & DAP Track" },
      { name: "twitter:description", content: HOME_DESCRIPTION },
      { name: "twitter:image", content: "https://dapgames.lovable.app/og-image.png" },
    ],
    links: [
      { rel: "canonical", href: "https://dapgames.lovable.app/" },
      { rel: "preload", as: "image", href: logo.url, fetchPriority: "high" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "DAP Games",
          description: HOME_DESCRIPTION,
          url: "https://dapgames.lovable.app/",
          isPartOf: { "@type": "WebSite", name: "DAP Games", url: "https://dapgames.lovable.app" },
        }),
      },
    ],
  }),
  component: Home,
});

const daptrack = GAME_CATALOG.find((g) => g.slug === "daptrack");

function Home() {
  const featured = topGames(8);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8">
      <AdBanner placement="top" />

      <section className="flex flex-col items-center gap-4 py-6 text-center">
        <img
          src={logo.url}
          alt="DAP Games"
          width={512}
          height={512}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="h-[min(16vh,6rem)] w-[min(16vh,6rem)] rounded-3xl bg-card/40 p-2 ring-1 ring-border/60 object-contain"
        />
        <h1
          className="text-4xl font-semibold leading-[1.2] tracking-tight sm:text-5xl"
          style={{
            backgroundImage: "var(--gradient-text)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          DAP Games
        </h1>
        <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
          A free browser arcade — classics, quick casual games, and DAP Track,
          our own 3D time-trial racer with a built-in track editor.
        </p>
        <Link
          to="/games"
          className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-transform hover:scale-105"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Gamepad2 className="h-4 w-4" />
          Browse all games
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {daptrack && (
        <section className="rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                Featured
              </span>
              <h2 className="mt-1 text-2xl font-semibold">{daptrack.emoji} {daptrack.title}</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                {daptrack.description} Build and share your own tracks, race ghosts,
                and chase medals.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                to="/games/daptrack"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
              >
                Play now
              </Link>
              <Link
                to="/games/daptrack/browse"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Community tracks
              </Link>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="top-games-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="top-games-heading" className="text-xl font-semibold">
            Top games
          </h2>
          <Link to="/games" className="text-sm font-medium text-primary hover:underline">
            See all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {featured.map((g) => (
            <Link
              key={g.slug}
              to={g.route}
              className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card/40 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <span className="text-3xl transition-transform group-hover:scale-110" aria-hidden>
                {g.emoji}
              </span>
              <span className="text-sm font-medium text-foreground">{g.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <AdBanner placement="bottom" />
    </div>
  );
}
