import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help — Lumen" }] }),
  component: Help,
});

const faqs = [
  { q: "Is Lumen connected to a real AI?", a: "Not yet — this is the interface. AI will be wired in later." },
  { q: "How do I start a new chat?", a: "Click 'New chat' in the sidebar or the Lumen logo at the top." },
  { q: "Where do my conversations go?", a: "Recent chats appear under the Recent section in the sidebar." },
];

function Help() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Help & FAQ</h1>
      <div className="mt-8 space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-border bg-card p-5">
            <summary className="cursor-pointer list-none font-medium text-foreground">{f.q}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
