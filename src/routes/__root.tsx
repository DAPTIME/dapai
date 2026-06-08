import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
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
import { EyeOff, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AccountMenu } from "@/components/account-menu";
import { AppContextMenu } from "@/components/app-context-menu";
import { useTheme } from "@/lib/theme";
import { getProfile } from "@/lib/chats.functions";
import appCss from "../styles.css?url";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DAP AI" },
      { property: "og:site_name", content: "DAP AI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "google-site-verification", content: "ihyVMpSKja5zvyeVXgKwlPewFA3s5qzQJX9FolcYAHI" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/66282eb6-e53c-4f21-9d65-92a76922cf37" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/66282eb6-e53c-4f21-9d65-92a76922cf37" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "DAP AI",
              url: "https://dapai.lovable.app",
            },
            {
              "@type": "WebSite",
              name: "DAP AI",
              url: "https://dapai.lovable.app",
            },
          ],
        }),
      },
    ],
  }),
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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContextMenu>
          <SidebarProvider>
            <div className="flex min-h-screen w-full bg-background">
              <AppSidebar />
              <div className="flex flex-1 flex-col">
                <HeaderBar />
                <main className="flex-1">
                  <RouteTransition>
                    <Outlet />
                  </RouteTransition>
                </main>
              </div>
            </div>
            <Toaster />
          </SidebarProvider>
        </AppContextMenu>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function HeaderBar() {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getProfile);
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });
  const isPro = profileQuery.data?.tier === "pro";

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <span className="text-sm font-medium text-muted-foreground">DAP AI</span>
      </div>
      <div className="flex items-center gap-2">
        {!isPro && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">Upgrade</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upgrade to Pro</DialogTitle>
                <DialogDescription>
                  Pay Devansh 5 AED irl 💸
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                Hand over 5 AED to Devansh in person, and your account will be upgraded to Pro.
              </div>
              <DialogFooter>
                <Button variant="secondary" size="sm" onClick={(e) => (e.currentTarget.closest('[role="dialog"]') as HTMLElement)?.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click()}>
                  Got it
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        <AccountMenu />
      </div>
    </header>
  );
}

function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div key={pathname} className="route-transition-enter">
      {children}
    </div>
  );
}
