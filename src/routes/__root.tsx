import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarSwipeGestures } from "@/components/sidebar-swipe-gestures";
import { AiReplyListener } from "@/components/ai-reply-listener";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EyeOff, Eye, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { UpgradeGateProvider, useUpgradeGate } from "@/lib/tier-gate";
import { AccountSetupGate } from "@/components/account-setup-gate";
import { SuspendedGate } from "@/components/suspended-gate";

import { AccountMenu } from "@/components/account-menu";
import { AppContextMenu } from "@/components/app-context-menu";
import { InstallAppButton } from "@/components/install-app-button";
import { registerServiceWorker } from "@/lib/register-sw";
import { useTheme } from "@/lib/theme";
import { LINKTREE_URL } from "@/lib/plans";
import { pageFlagFor, useFeatureGuard } from "@/lib/feature-guard";

import { getProfile } from "@/lib/chats.functions";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
import {
  getPublicSiteConfig,
  DEFAULT_SITE_CONFIG,
} from "@/lib/site-config.functions";

import appCss from "../styles.css?url";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DAP AI — Free AI Chatbot" },
      { name: "application-name", content: "DAP AI" },
      { name: "apple-mobile-web-app-title", content: "DAP AI" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#090d15" },
      { property: "og:site_name", content: "DAP AI" },


      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "google-site-verification", content: "ihyVMpSKja5zvyeVXgKwlPewFA3s5qzQJX9FolcYAHI" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/66282eb6-e53c-4f21-9d65-92a76922cf37" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/66282eb6-e53c-4f21-9d65-92a76922cf37" },
      { property: "og:title", content: "DAP AI — Free AI Chatbot" },
      { name: "twitter:title", content: "DAP AI — Free AI Chatbot" },
      { name: "description", content: "DAP AI (dapai) — the only AI chatbot you'll ever need. Free DAP AI chat, DAP arcade games and more." },
      { property: "og:description", content: "DAP AI (dapai) — the only AI chatbot you'll ever need. Free DAP AI chat, DAP arcade games and more." },
      { name: "twitter:description", content: "DAP AI (dapai) — the only AI chatbot you'll ever need. Free DAP AI chat, DAP arcade games and more." },
      { name: "keywords", content: "DAP AI, dapai, dap ai, dap, DAP, AI, ai chat, ai chatbot, dapai chat, dap chatbot, free AI, DAP AI 4 Pro, DAP AI 4 Lite, DAP arcade, DAP Track" },

    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],

    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "DAP AI",
              alternateName: ["DAP", "dap", "dapai", "dap ai", "DAP Ai", "DAPAI", "DAP AI Chatbot", "AI by DAP"],
              url: "https://dapai.lovable.app",
              logo: "https://dapai.lovable.app/favicon.png",
            },
            {
              "@type": "WebSite",
              name: "DAP AI",
              alternateName: ["DAP", "dap", "dapai", "dap ai", "DAP Ai", "DAPAI", "DAP AI Chatbot", "AI by DAP"],
              url: "https://dapai.lovable.app",
            },
          ],

        }),
      },
    ],
  }),
  // Loaded during SSR so pages know instantly whether the admin has
  // disabled the site or a model — no client round trip, no delay.
  loader: async () => {
    try {
      return { siteConfig: await getPublicSiteConfig() };
    } catch {
      return { siteConfig: DEFAULT_SITE_CONFIG };
    }
  },
  shellComponent: RootShell,
  component: RootComponent,

  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-5xl font-semibold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found.</p>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Mount the theme effect so the persisted choice is applied + synced.
  useTheme();
  // Installability: registers only in the published app (see register-sw).
  useEffect(() => registerServiceWorker(), []);
  useEffect(() => {

    if (typeof document === "undefined") return;
    const apply = () => document.documentElement.classList.toggle("liquid-glass", localStorage.getItem("dap.glass") === "1");
    apply();
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { key: string; value: boolean } | undefined;
      if (d?.key === "dap.glass") document.documentElement.classList.toggle("liquid-glass", !!d.value);
    };
    window.addEventListener("dap.setting", handler);
    return () => window.removeEventListener("dap.setting", handler);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UpgradeGateProvider>
        <AppContextMenu>
          <SidebarProvider>
            <SidebarSwipeGestures />
            <AiReplyListener />
            <div className="flex min-h-screen w-full bg-background">
              <AppSidebar />
              {/* min-w-0: a flex item defaults to min-width:auto, so this
                  column could never shrink below its widest child. Any
                  wide content — the arcade's scroller, a game board —
                  pushed the column past the viewport and took the header
                  and the whole document's horizontal scroll with it. */}
              <div className="flex min-w-0 flex-1 flex-col">
                <HeaderBar />
                <main className="flex-1">
                  <RouteTransition>
                    <Outlet />
                  </RouteTransition>
                  <SiteFooter />
                </main>
              </div>
            </div>
            <AccountSetupGate />
            <SuspendedGate />
            <Toaster />

          </SidebarProvider>
        </AppContextMenu>
        </UpgradeGateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function IncognitoToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOn(localStorage.getItem("dap.incognito") === "1");
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key: string; value: boolean } | undefined;
      if (detail?.key === "dap.incognito") setOn(!!detail.value);
    };
    window.addEventListener("dap.setting", handler);
    return () => window.removeEventListener("dap.setting", handler);
  }, []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("dap.incognito", next ? "1" : "0");
      window.dispatchEvent(new CustomEvent("dap.setting", { detail: { key: "dap.incognito", value: next } }));
      document.documentElement.classList.toggle("incognito", next);
    }
  };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={on ? "default" : "ghost"}
            size="sm"
            onClick={toggle}
            className="gap-1.5"
            aria-pressed={on}
            aria-label={on ? "Incognito mode on" : "Incognito mode off"}
          >
            {on ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">Incognito</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{on ? "Incognito on — chats won't be saved" : "Turn on incognito"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function HeaderBar() {
  const { user } = useAuth();
  const { openUpgrade } = useUpgradeGate();

  const fetchProfile = useServerFn(getProfile);
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });
  const isPro =
    TIER_RANK[(profileQuery.data?.tier as Tier | undefined) ?? "free"] >=
    TIER_RANK.pro;

  /* The two groups inside the header were flex items with nothing
     stopping them growing, so on a phone the account controls pushed it
     out to ~770px against a 412px screen — and because the header is in
     the page flow, the whole document scrolled sideways on every route.
     min-w-0 lets them shrink, and the brand truncates rather than
     forcing width. */
  return (
    <header className="sticky top-0 z-10 flex h-14 w-full max-w-full items-center justify-between gap-2 overflow-hidden border-b border-border bg-background/80 px-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger />
        <span className="truncate text-sm font-medium text-muted-foreground">DAP AI</span>
      </div>
      <div className="flex min-w-0 shrink items-center gap-2">
        <InstallAppButton />
        <IncognitoToggle />

        {!isPro && (
          <Button
            size="sm"
            className="animate-pulse-glow gap-1 rounded-full px-3 font-semibold text-primary-foreground shadow-md transition-transform hover:scale-105"
            style={{ background: "var(--gradient-brand)" }}
            onClick={() => openUpgrade()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade
          </Button>
        )}

        <AccountMenu />
      </div>
    </header>
  );
}



function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const off = useFeatureGuard(pageFlagFor(pathname));
  if (off) return null;
  return (
    <div key={pathname} className="route-transition-enter">
      {children}
    </div>
  );
}

/**
 * Footer link, on every page except the chat surface itself.
 *
 * The main page and a thread are one continuous scroll ending at the
 * composer; a footer under that would sit below the input box or push
 * it off screen, so those are excluded by path.
 */
const FOOTERLESS = ["/", "/c", "/chat"];

function SiteFooter() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = FOOTERLESS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (bare) return null;

  return (
    <footer className="border-t border-border px-6 py-6 text-center">
      <a
        href={LINKTREE_URL}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {LINKTREE_URL.replace(/^https?:\/\//, "")}
      </a>
    </footer>
  );
}
