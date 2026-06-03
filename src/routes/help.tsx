import { createFileRoute } from "@tanstack/react-router";

const FAQS = [
  {
    q: "Is DAP AI connected to a real AI?",
    a: "Yes — DAP AI routes requests to one of two models (DAP AI 3.2 Pro and DAP AI Lite) and streams responses back into your chat.",
  },
  {
    q: "How do I start a new chat?",
    a: "Click 'New chat' in the sidebar, the DAP AI logo at the top, or pick a Gem from the Gems tab.",
  },
  {
    q: "Where do my conversations go?",
    a: "Recent chats appear under the Chats section in the sidebar. Free accounts keep 5 chats; Pro accounts keep 10.",
  },
  {
    q: "What's the difference between the Pro and Lite models?",
    a: "DAP AI 3.2 (Pro) is the stronger model with better reasoning. DAP AI Lite is faster and unlimited. Free accounts get 5 Pro messages, then switch to Lite automatically.",
  },
];

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & FAQ — DAP AI" },
      {
        name: "description",
        content:
          "Answers to common DAP AI questions: starting chats, managing history, model differences, and account tiers.",
      },
      { property: "og:title", content: "Help & FAQ — DAP AI" },
      {
        property: "og:description",
        content: "Answers to common DAP AI questions.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/help" },
    ],
    links: [{ rel: "canonical", href: "https://dapai.lovable.app/help" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: Help,
});

function Help() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Help & FAQ</h1>
      <div className="mt-8 space-y-3">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="group rounded-2xl border border-border bg-card p-5"
          >
            <summary className="cursor-pointer list-none font-medium text-foreground">
              <h2 className="inline text-base font-medium">{f.q}</h2>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
