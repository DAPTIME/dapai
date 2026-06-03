import { createFileRoute } from "@tanstack/react-router";

const FAQS = [
  {
    q: "Is DAP AI connected to a real AI?",
    a: "Yes — DAP AI routes requests to one of two models (DAP AI 3.2 Pro and DAP AI Lite) and streams responses back into your chat.",
  },
  {
    q: "How do I start a new chat?",
    a: "Click 'New chat' in the sidebar, the DAP AI logo at the top, or pick a DAP from the DAPs tab.",
  },
  {
    q: "Where do my conversations go?",
    a: "Recent chats appear under the Chats section in the sidebar. Free accounts keep 5 chats; Pro accounts keep 10.",
  },
  {
    q: "What's the difference between the Pro and Lite models?",
    a: "DAP AI 3.2 (Pro) is the stronger model with better reasoning. DAP AI Lite is faster and unlimited. Free accounts get 5 Pro messages, then switch to Lite automatically.",
  },
  {
    q: "What are DAPs?",
    a: "DAPs are custom AI personas you can create. Each DAP has its own instructions and personality, so you can build a Coding Mentor, a Sous Chef, a Study Buddy — whatever you need.",
  },
  {
    q: "How do I create a custom DAP?",
    a: "Go to the DAPs page, scroll to 'New custom DAP', give it a name, emoji, and instructions. Once saved, it appears in your DAP list and you can start chats with it.",
  },
  {
    q: "Can I delete a custom DAP?",
    a: "Yes. On the DAPs page, click the trash icon next to any custom DAP you created. This also removes it from the sidebar.",
  },
  {
    q: "How do I switch models mid-chat?",
    a: "You don't need to. If you have Pro messages remaining, DAP AI 3.2 is used automatically. Once those run out, Lite kicks in. You can upgrade to Pro anytime for more Pro messages.",
  },
  {
    q: "Does DAP AI remember my chats?",
    a: "Yes — each chat thread keeps full context, so the AI remembers what you discussed earlier in that conversation.",
  },
  {
    q: "Keyboard shortcuts",
    a: "Press Cmd/Ctrl + Enter to send a message. Press Escape to close modals or collapse open panels.",
  },
  {
    q: "Is my data private?",
    a: "Chats are tied to your account and protected by Row Level Security in our backend. Only you can read your own conversations.",
  },
  {
    q: "How do I upgrade to Pro?",
    a: "Click your profile in the sidebar, then 'Manage subscription' to upgrade. Pro unlocks more Pro model messages and a larger chat history.",
  },
  {
    q: "The AI gave a weird or wrong answer. What should I do?",
    a: "Try rephrasing your question or giving more context. You can also start a fresh chat — sometimes a clean thread helps. If it's consistently wrong, let us know through the feedback option.",
  },
  {
    q: "Can I use DAP AI on mobile?",
    a: "Yes. The site is fully responsive and works on phones and tablets. Just visit the same URL on any device.",
  },
];

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & FAQ — DAP AI" },
      {
        name: "description",
        content:
          "Answers to common DAP AI questions: starting chats, managing history, model differences, DAPs, and account tiers.",
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
