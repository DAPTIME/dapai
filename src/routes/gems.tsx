import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/gems")({
  head: () => ({ meta: [{ title: "Gems — Lumen" }] }),
  component: Gems,
});

const gems = [
  { name: "Career coach", desc: "Helps with resumes, interviews, and career moves." },
  { name: "Code reviewer", desc: "Reviews code and suggests improvements." },
  { name: "Trip planner", desc: "Builds day-by-day travel itineraries." },
  { name: "Study buddy", desc: "Quizzes you and explains tough concepts." },
];

function Gems() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Gems</h1>
          <p className="mt-2 text-muted-foreground">Custom AI helpers for specific tasks.</p>
        </div>
        <Button style={{ background: "var(--gradient-brand)" }}>
          <Plus className="mr-2 h-4 w-4" /> New Gem
        </Button>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {gems.map((g) => (
          <div key={g.name} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{g.name}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{g.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
