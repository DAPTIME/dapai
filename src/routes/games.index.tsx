import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/games/")({
  component: GamesHome,
});

const GAMES = [
  { to: "/games/2048" as const, label: "2048", emoji: "🟨", desc: "Slide, merge, chase 2048." },
  { to: "/games/snake" as const, label: "Snake", emoji: "🐍", desc: "Classic — don't bite yourself." },
  { to: "/games/spacewar" as const, label: "Spacewar", emoji: "🚀", desc: "Dodge asteroids, blast rocks." },
  { to: "/games/polytrack" as const, label: "Poly Racer", emoji: "🏎️", desc: "Zip around a low-poly track." },
];

function GamesHome() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-3xl font-bold text-transparent">
        DAP Arcade
      </h1>
      <p className="mt-2 text-muted-foreground">
        A little fun on the side. Pick a game.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GAMES.map((g, i) => (
          <Link
            key={g.to}
            to={g.to}
            style={{ animationDelay: `${i * 60}ms` }}
            className="group animate-fade-in rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg"
          >
            <div className="text-3xl transition-transform group-hover:scale-110">{g.emoji}</div>
            <div className="mt-3 text-lg font-semibold">{g.label}</div>
            <div className="text-sm text-muted-foreground">{g.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
