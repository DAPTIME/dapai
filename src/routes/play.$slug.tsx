import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Expand, ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";

import { AdBanner } from "@/components/ads/ad-banner";
import { AdGate } from "@/components/ads/ad-gate";
import { AdRail } from "@/components/ads/ad-rail";
import { Button } from "@/components/ui/button";
import { getFeedGame } from "@/lib/gamepix.functions";
import { relayedFrame, setRelayMode, useRelay } from "@/lib/relay";


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
  const [slow, setSlow] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /* Networks that filter the provider's domain leave the frame permanently
     blank. autoRelay is the session-wide probe result; forceRelay is the
     player's own "Unblock" button, for the case where the probe passed but
     the game host itself is filtered. */
  const autoRelay = useRelay();
  const [forceRelay, setForceRelay] = useState(false);
  const useProxy = autoRelay || forceRelay;

  const { data: game, isPending } = useQuery({
    queryKey: ["feed-game", slug],
    queryFn: () => fetchGame({ data: { slug } }),
    staleTime: 60 * 60 * 1000,
  });

  // Prefer the game's own files: no provider launcher, consent pop-up, or
  // branding, and everything is served from our own address in relay mode.
  const sourceUrl = game ? (game.buildUrl ?? game.url) : "";
  const frameSrc = game ? (useProxy ? relayedFrame(sourceUrl, slug) : sourceUrl) : "";

  // The provider shell signals load before the actual game does. Keep a
  // recovery control available after startup instead of treating that first
  // blue shell as proof that the game itself loaded.
  useEffect(() => {
    if (!started) return;
    const id = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(id);
  }, [started, reloadKey]);

  const goFullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const reloadGame = () => {
    setSlow(false);
    setReloadKey((key) => key + 1);
  };

  const enableUnblock = () => {
    setRelayMode("on");
    setForceRelay(true);
    reloadGame();
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
        <Button
          type="button"
          onClick={goFullscreen}
          variant="outline"
          size="sm"
        >
          <Expand className="h-4 w-4" /> Fullscreen
        </Button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        {game?.title ?? slug.replace(/-/g, " ")}
      </h1>

      {!started ? (
        <AdGate label={game?.title} onDone={() => setStarted(true)}>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 p-8">
            <p className="text-sm text-muted-foreground">Starting {game?.title ?? "your game"}…</p>
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
                key={`${frameSrc}-${reloadKey}`}
                src={frameSrc}
                title={game.title}
                className="aspect-video w-full"
                allow="autoplay; fullscreen; gamepad; clipboard-write; cross-origin-isolated"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
            )}
          </div>

          {slow && game && (
            <div className="absolute inset-x-0 bottom-[60px] flex flex-wrap items-center justify-center gap-3 bg-background/90 p-3 text-xs">
              <span className="text-muted-foreground">
                {useProxy
                  ? "Game taking too long?"
                  : "Game blocked or stuck on this network?"}
              </span>
              {!useProxy && (
                <Button type="button" onClick={enableUnblock} size="sm">
                  <ShieldCheck className="h-3.5 w-3.5" /> Unblock mode
                </Button>
              )}
              <Button
                type="button"
                onClick={reloadGame}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reload game
              </Button>
              <a
                href={frameSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border px-3 py-1 hover:border-primary hover:text-primary"
              >
                Open in new tab
              </a>
            </div>
          )}

        </div>
      )}


      {game?.description && (
        <p className="max-w-2xl text-sm text-muted-foreground">{game.description}</p>
      )}

      <AdBanner placement="bottom" />
    </div>
  );
}
