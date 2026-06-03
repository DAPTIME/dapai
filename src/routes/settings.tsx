import { createFileRoute } from "@tanstack/react-router";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — DAP AI" },
      {
        name: "description",
        content:
          "Manage your DAP AI account preferences: chat history, sound effects, and beta features.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Settings,
});

function Settings() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-8 space-y-6">
        {[
          { id: "history", label: "Save chat history", desc: "Keep recent conversations in the sidebar." },
          { id: "sounds", label: "Sound effects", desc: "Play subtle sounds on send/receive." },
          { id: "beta", label: "Beta features", desc: "Try experimental tools early." },
        ].map((row) => (
          <div key={row.id} className="flex items-start justify-between rounded-2xl border border-border bg-card p-5">
            <div>
              <Label htmlFor={row.id} className="text-base">{row.label}</Label>
              <p className="mt-1 text-sm text-muted-foreground">{row.desc}</p>
            </div>
            <Switch id={row.id} defaultChecked={row.id === "history"} />
          </div>
        ))}
      </div>
    </div>
  );
}
