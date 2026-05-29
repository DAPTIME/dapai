import { createFileRoute } from "@tanstack/react-router";
import { Compass, Code, BookOpen, Image, Music, Briefcase } from "lucide-react";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore — Lumen" },
      { name: "description", content: "Discover what Lumen can do." },
    ],
  }),
  component: Explore,
});

const cards = [
  { icon: Code, title: "Code & debug", desc: "Write, explain, and refactor code in any language." },
  { icon: BookOpen, title: "Learn anything", desc: "Get clear explanations for hard topics." },
  { icon: Image, title: "Creative writing", desc: "Stories, poems, posts and more." },
  { icon: Music, title: "Make a plan", desc: "Trips, workouts, study schedules." },
  { icon: Briefcase, title: "Work smarter", desc: "Emails, summaries, meeting notes." },
  { icon: Compass, title: "Brainstorm", desc: "Names, ideas, angles to explore." },
];

function Explore() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Explore Lumen</h1>
      <p className="mt-2 text-muted-foreground">A few ways people use Lumen every day.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.title}
            className="rounded-2xl border border-border bg-card p-5 transition hover:shadow-[var(--shadow-soft)]"
          >
            <div
              className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
              style={{ background: "var(--gradient-brand)" }}
            >
              <c.icon className="h-5 w-5" />
            </div>
            <h3 className="font-medium text-foreground">{c.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
