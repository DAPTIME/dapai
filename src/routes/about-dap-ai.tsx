import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about-dap-ai")({
  head: () => ({
    meta: [
      {
        title:
          "DAP AI — Free AI Chatbot, AI Assistant & DAP AI 3.2 Pro Model",
      },
      {
        name: "description",
        content:
          "DAP AI is a free AI chatbot and AI assistant. Chat with DAP AI Lite for free or upgrade to DAP AI 3.2 Pro for advanced reasoning, web search, vision, custom DAPs, and AI memory.",
      },
      {
        name: "keywords",
        content:
          "DAP AI, DAP AI chatbot, DAP AI 3.2, DAP AI Pro, DAP AI Lite, dapai, dap ai assistant, free AI chatbot, AI chat, AI assistant, custom AI personas, DAPs, AI memory, chat GPT alternative, free chatbot, AI search, web search AI, vision AI, image chat, ai for students, online ai chatbot, dapai lovable app",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "DAP AI — Free AI Chatbot & Assistant" },
      {
        property: "og:description",
        content:
          "Meet DAP AI: a free AI chatbot with a Pro tier (DAP AI 3.2), custom personas (DAPs), AI memory, web search, and vision. Try it free.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dapai.lovable.app/about-dap-ai" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "DAP AI — Free AI Chatbot & Assistant" },
      {
        name: "twitter:description",
        content:
          "Free AI chatbot with Pro reasoning model DAP AI 3.2, custom DAPs, memory, web search, and vision.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://dapai.lovable.app/about-dap-ai" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "DAP AI",
          alternateName: ["DAP AI 3.2", "DAP AI Pro", "DAP AI Lite", "dapai"],
          applicationCategory: "Chatbot",
          operatingSystem: "Web",
          url: "https://dapai.lovable.app",
          description:
            "DAP AI is a free AI chatbot and AI assistant with a Pro tier (DAP AI 3.2) offering advanced reasoning, web search, vision, custom DAPs, and AI memory.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is DAP AI?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "DAP AI is a free AI chatbot and AI assistant available at dapai.lovable.app. It includes DAP AI Lite (free) and DAP AI 3.2 Pro for advanced reasoning, web search, vision and custom AI personas (DAPs).",
              },
            },
            {
              "@type": "Question",
              name: "Is DAP AI free?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. DAP AI Lite is free. DAP AI 3.2 Pro is available on the Pro plan and unlocks the smarter model, custom DAPs, AI memory and other features.",
              },
            },
            {
              "@type": "Question",
              name: "What is DAP AI 3.2?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "DAP AI 3.2 is the Pro model in DAP AI. It uses a larger reasoning model with web search, vision (image input) and longer chat memory.",
              },
            },
            {
              "@type": "Question",
              name: "What are DAPs?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "DAPs are custom AI personas inside DAP AI. Pro users can create their own DAPs with a name, emoji, opener and system prompt to specialize the assistant for any task.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: AboutDapAi,
});

function AboutDapAi() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">
        DAP AI — Free AI Chatbot & AI Assistant
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        DAP AI is a free online AI chatbot and AI assistant. Chat with{" "}
        <strong>DAP AI Lite</strong> for free or upgrade to{" "}
        <strong>DAP AI 3.2 Pro</strong> for advanced reasoning, live web
        search, image (vision) input, custom AI personas (DAPs), and AI
        memory across conversations.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">What is DAP AI?</h2>
      <p className="mt-3 text-muted-foreground">
        DAP AI (sometimes written “dap ai” or “dapai”) is a conversational
        AI built for fast, helpful answers — coding help, writing,
        brainstorming, research, study help, and everyday questions. It
        runs in your browser at{" "}
        <a className="underline" href="https://dapai.lovable.app">
          dapai.lovable.app
        </a>{" "}
        — no install required.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">DAP AI models</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>
          <strong>DAP AI Lite</strong> — free, fast, great for quick
          questions and chat.
        </li>
        <li>
          <strong>DAP AI 3.2 (Pro)</strong> — the smarter reasoning model
          with web search, image vision, longer memory and custom DAPs.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">Features</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>Free AI chatbot — no credit card required.</li>
        <li>Live web search powered by Firecrawl for up-to-date answers.</li>
        <li>Image / vision input (Pro) — chat about screenshots and photos.</li>
        <li>Custom DAPs — build your own AI personas with custom prompts.</li>
        <li>AI memory — DAP AI remembers facts about you across chats.</li>
        <li>Incognito mode — chat without saving history to your sidebar.</li>
        <li>Dark and light themes, mobile-friendly, fast loading.</li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">FAQ</h2>

      <h3 className="mt-6 text-lg font-semibold">Is DAP AI free?</h3>
      <p className="mt-2 text-muted-foreground">
        Yes — DAP AI Lite is free. DAP AI 3.2 Pro unlocks the larger
        reasoning model, custom DAPs, AI memory and more.
      </p>

      <h3 className="mt-6 text-lg font-semibold">Is DAP AI like ChatGPT?</h3>
      <p className="mt-2 text-muted-foreground">
        DAP AI is a chatbot in the same family of tools as ChatGPT,
        Claude, Gemini and Perplexity. It’s a free ChatGPT alternative
        with its own Pro model (DAP AI 3.2), custom personas and live web
        search.
      </p>

      <h3 className="mt-6 text-lg font-semibold">How do I try DAP AI?</h3>
      <p className="mt-2 text-muted-foreground">
        Open the{" "}
        <Link to="/" className="underline">
          DAP AI home page
        </Link>{" "}
        and start typing. Sign up for a free account to save your chats,
        or upgrade to Pro for DAP AI 3.2.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Keywords</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        DAP AI, dap ai, dapai, DAP AI chatbot, DAP AI assistant, DAP AI
        3.2, DAP AI Pro, DAP AI Lite, DAP AI free, DAP AI online, DAP AI
        login, DAP AI sign up, free AI chatbot, AI assistant, custom AI
        personas, DAPs, AI memory, web search AI, vision AI, ChatGPT
        alternative, free chatbot online, AI for students, AI for coding,
        AI for writing, dapai lovable app.
      </p>
    </div>
  );
}
