import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { AccountMenu } from "@/components/account-menu";
import appCss from "../styles.css?url";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DAP AI" },
      { name: "description", content: "DAP AI is a fast, friendly AI chat workspace." },
      { property: "og:title", content: "DAP AI" },
      { name: "twitter:title", content: "DAP AI" },
      { property: "og:description", content: "DAP AI is a fast, friendly AI chat workspace." },
      { name: "twitter:description", content: "DAP AI is a fast, friendly AI chat workspace." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d4ddeeda-a5fa-491c-98ac-e5bf7f678179/id-preview-60df72d6--4e5794db-69e7-4998-9ede-a9b885182642.lovable.app-1780308353128.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d4ddeeda-a5fa-491c-98ac-e5bf7f678179/id-preview-60df72d6--4e5794db-69e7-4998-9ede-a9b885182642.lovable.app-1780308353128.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-background">
            <AppSidebar />
            <div className="flex flex-1 flex-col">
              <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-3 backdrop-blur">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <span className="text-sm font-medium text-muted-foreground">DAP AI</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm">Upgrade</Button>
                  <AccountMenu />
                </div>
              </header>
              <main className="flex-1">
                <Outlet />
              </main>
            </div>
          </div>
          <Toaster />
        </SidebarProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
