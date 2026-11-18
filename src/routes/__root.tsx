import { Link, Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarSwipeGestures } from "@/components/sidebar-swipe-gestures";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { UpgradeGateProvider } from "@/lib/tier-gate";
import { AccountSetupGate } from "@/components/account-setup-gate";
import { SuspendedGate } from "@/components/suspended-gate";

import { AccountMenu } from "@/components/account-menu";
import { AppContextMenu } from "@/components/app-context-menu";
import { InstallAppButton } from "@/components/install-app-button";
import { registerServiceWorker } from "@/lib/register-sw";
import { useTheme } from "@/lib/theme";
import { pageFlagFor, useFeatureGuard } from "@/lib/feature-guard";
import { ProDialog } from "@/components/pro-dialog";
import { AdSenseScript } from "@/components/ads/adsense-script";
import { ADSENSE_CLIENT } from "@/lib/ads";

import { getMyProfile } from "@/lib/profile.functions";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
import {
  getPublicSiteConfig,
  DEFAULT_SITE_CONFIG,
} from "@/lib/site-config.functions";

import appCss from "../styles.css?url";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { name: "google-adsense-account", content: "ca-pub-2164790706730330" },
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "application-name", content: "DAP Games" },
      { name: "apple-mobile-web-app-title", content: "DAP Games" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#090d15" },
      { property: "og:site_name", content: "DAP Games" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "google-site-verification", content: "ihyVMpSKja5zvyeVXgKwlPewFA3s5qzQJX9FolcYAHI" },
      { property: "og:image", content: "https://dapgames.lovable.app/og-image.png" },
      { name: "twitter:image", content: "https://dapgames.lovable.app/og-image.png" },

    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],

    scripts: [
      // Served in the HTML source so Google's reviewer and crawler always see
      // the ad code, not only browsers that run our client-side effects.
      {
        src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`,
        async: true,
        crossOrigin: "anonymous",
      },

      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "DAP Games",
              alternateName: ["DAP Games Arcade", "DAPGames", "dapgames"],
              url: "https://dapgames.lovable.app/",
              logo: "https://dapgames.lovable.app/favicon.png",
            },
            {
              "@type": "WebSite",
              name: "DAP Games",
              alternateName: "DAP Games Arcade",
              url: "https://dapgames.lovable.app/",
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
  // The message is deliberately not shown. This boundary catches whatever
  // escaped every other handler — a render fault, a stack, a database error
  // that missed the sanitiser — and printing that verbatim on a public page
  // is how a schema leaks. It goes to the console instead, where the browser
  // devtools and the server logs can both see it, and the visitor gets
  // something they can act on.
  errorComponent: ({ error }) => {
    if (typeof console !== "undefined") console.error("[app]", error);
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Try reloading the page. If it keeps happening, let us know.
          </p>
        </div>
      </div>
    );
  },
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
            <AdSenseScript />
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

function HeaderBar() {
  const { user } = useAuth();
  const [proOpen, setProOpen] = useState(false);

  const fetchProfile = useServerFn(getMyProfile);
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
        {/* The brand text used to sit here. On a phone it truncated to
            "DA..." — a label that names nothing and still charged ~55px
            against a header that was already overflowing. The sidebar
            button is the only thing that has to be in this corner, so it
            takes the space and gets a little larger while it is at it. */}
        <SidebarTrigger className="h-9 w-9 [&_svg]:size-5" />
      </div>
      <div className="flex min-w-0 shrink items-center gap-2">
        <InstallAppButton />

        {!isPro && (
          <Button
            size="sm"
            onClick={() => setProOpen(true)}
            className="animate-pulse-glow gap-1 rounded-full px-3 font-semibold text-primary-foreground shadow-md transition-transform hover:scale-105"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Go Pro — no ads
          </Button>
        )}

        <AccountMenu />
      </div>
      <ProDialog open={proOpen} onOpenChange={setProOpen} />
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
 * Footer link, on every page except the game surfaces themselves, where a
 * footer would sit under the board or push the controls off screen.
 */
const FOOTERLESS = ["/"];

function SiteFooter() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = FOOTERLESS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (bare) return null;

  return (
    <footer className="border-t border-border px-6 py-6 text-center">
      <span className="text-xs text-muted-foreground">DAP Games</span>
    </footer>
  );
}
