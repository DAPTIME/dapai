import { useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Expand, ArrowLeft } from "lucide-react";

import { AdBanner } from "@/components/ads/ad-banner";
import { AdGate } from "@/components/ads/ad-gate";
import { AdRail } from "@/components/ads/ad-rail";
import { getFeedGame } from "@/lib/gamepix.functions";

export const Route = createFileRoute("/play/$slug")({
  head: ({ params }) => {
    const name = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const description = `Play ${name} free online at DAP Games — no download, straight in your browser on desktop or mobile.`;
    return {
      meta: [
        { title: `${name} — Play Free Online | DAP Games` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} — Play Free Online` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `https://dapgames.lovable.app/play/${params.slug}` }],
    };
  },
  component: PlayFeedGame,
});

function PlayFeedGame() {
  const { slug } = Route.useParams();
  const fetchGame = useServerFn(getFeedGame);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);

  const { data: game, isPending } = useQuery({
    queryKey: ["feed-game", slug],
    queryFn: () => fetchGame({ data: { slug } }),
    staleTime: 60 * 60 * 1000,
  });

  const goFullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
      <AdBanner placement="top" />

      <div className="flex items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All games
        </Link>
        <button
          type="button"
          onClick={goFullscreen}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <Expand className="h-4 w-4" /> Fullscreen
        </button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        {game?.title ?? slug.replace(/-/g, " ")}
      </h1>

      {!started ? (
        <AdGate label={game?.title}>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 p-8">
            <p className="text-sm text-muted-foreground">Your game is ready.</p>
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="rounded-full px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-transform hover:scale-105"
              style={{ background: "var(--gradient-brand)" }}
            >
              Play {game?.title ?? "now"}
            </button>
          </div>
        </AdGate>
      ) : (
        <div
          ref={shellRef}
          className="relative overflow-hidden rounded-2xl border border-border bg-black"
        >
          <AdRail />
          <div className="px-0 pb-[60px] pt-[50px]">
            {isPending || !game ? (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : (
              <iframe
                src={game.url}
                title={game.title}
                className="aspect-video w-full"
                allow="autoplay; fullscreen; gamepad; clipboard-write"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
        </div>
      )}

      {game?.description && (
        <p className="max-w-2xl text-sm text-muted-foreground">{game.description}</p>
      )}

      <AdBanner placement="bottom" />
    </div>
  );
}
