import { createFileRoute } from "@tanstack/react-router";
import { LINKTREE_URL, SUPPORT_EMAIL } from "@/lib/plans";

const FAQS = [
  {
    q: "What is DAP Games?",
    a: "DAP Games is a free browser game portal — thousands of arcade, puzzle, racing, .io and shooter games, all playable instantly with no download.",
  },
  {
    q: "How do I play a game?",
    a: "Click any game tile on the home page. Most games use arrow keys or WASD; touch controls appear automatically on phones and tablets.",
  },
  {
    q: "Do I need an account to play?",
    a: "No — every game works as a guest. Creating a free account lets you keep your settings and go ad-free on a paid plan.",
  },
  {
    q: "Is my game progress saved?",
    a: "Game progress is saved by each game inside your browser, so it can be lost if you clear browser data or switch devices.",
  },
  {
    q: "How do I report a broken game?",
    a: "Email us at " + SUPPORT_EMAIL + " with the game's name and a short description of the problem.",
  },
  {
    q: "I forgot my password. How do I recover my account?",
    a: "Use 'Forgot password' on the login page. If you set a recovery question, you can use it to reset your password from the Security page while signed in.",
  },
  {
    q: "Why do I see ads before a game loads?",
    a: "DAP Games is free and supported by a short (10-15 second) video ad before each game, plus banner ads around the site. This keeps every game free to play.",
  },
  {
    q: "How do I remove ads?",
    a: "Upgrading to Pro removes ads everywhere on the site. There's no in-app checkout yet — email us at " + SUPPORT_EMAIL + " or reach out via our Linktree and we'll set it up with you directly.",
  },
  {
    q: "Is my data private?",
    a: "Your account data and saved times are tied to your account and protected by Row Level Security in our backend — only you can read your own records.",
  },
  {
    q: "Can I play DAP Games on mobile?",
    a: "Yes. The site is fully responsive and most games support touch controls. Just visit the same URL on any device.",
  },
];

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & FAQ — DAP Games" },
      {
        name: "description",
        content:
          "Answers to common DAP Games questions: how to play, saving leaderboard times, accounts, ads, Pro, and reporting tracks.",
      },
      { property: "og:title", content: "Help & FAQ — DAP Games" },
      {
        property: "og:description",
        content: "Answers to common DAP Games questions.",
      },
      { property: "og:url", content: "https://dapgames.lovable.app/help" },
    ],
    links: [{ rel: "canonical", href: "https://dapgames.lovable.app/help" }],
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
      <p className="mt-8 text-sm text-muted-foreground">
        Still stuck? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
          {SUPPORT_EMAIL}
        </a>{" "}
        or find us via{" "}
        <a href={LINKTREE_URL} className="text-primary underline" target="_blank" rel="noreferrer">
          our Linktree
        </a>
        .
      </p>
    </div>
  );
}
