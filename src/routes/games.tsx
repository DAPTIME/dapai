import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Gamepad2 } from "lucide-react";

export const Route = createFileRoute("/games")({
  head: () => ({
    meta: [
      { title: "Games — DAP AI" },
      { name: "description", content: "Take a break with quick, AI-generated arcade games inside DAP AI." },
    ],
  }),
  component: GamesLayout,
});

const GAMES = [
  { to: "/games/2048" as const, label: "2048", emoji: "🟨" },
  { to: "/games/snake" as const, label: "Snake", emoji: "🐍" },
  { to: "/games/spacewar" as const, label: "Spacewar", emoji: "🚀" },
  { to: "/games/polytrack" as const, label: "Poly Racer", emoji: "🏎️" },
] as const;

function GamesLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b border-border bg-card/40 p-3 md:w-56 md:border-b-0 md:border-r">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Gamepad2 className="h-4 w-4 text-primary" /> Arcade
        </div>
        <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {GAMES.map((g) => {
            const to = `/games/${g.slug}`;
            const active = pathname === to;
            return (
              <Link
                key={g.slug}
                to={to}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all hover:translate-x-0.5 hover:bg-sidebar-accent ${
                  active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="text-base">{g.emoji}</span>
                <span>{g.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 p-4 md:p-8">
        <Outlet />
      </div>
    </div>
  );
}
