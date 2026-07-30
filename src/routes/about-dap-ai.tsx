import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about-dap-ai")({
  head: () => ({
    meta: [
      {
        title:
          "DAP AI — Free AI Chatbot & Small Language Model | Ask Anything: Weather, Code, Study, Recipes",
      },
      {
        name: "description",
        content:
          "DAP AI is a free AI chatbot built as a mixture-of-experts model — 15 to 23 experts depending on your plan, each roughly 7-9B parameters — running on hardware we own. Ask about the weather, news, coding, math, study help, writing, recipes, travel, career advice, and more.",
      },
      {
        name: "keywords",
        content:
          "DAP AI, dap ai, dapai, DAP, DAP AI 3.2, DAP AI Pro, DAP AI Lite, DAP AI chatbot, DAP AI assistant, free AI chatbot, free AI assistant, free chatbot online, mixture of experts, MoE model, sparse model, expert routing, 7B parameter experts, edge AI, on-device AI, self-hosted AI, private AI, local AI, Jetson Orin Nano AI, RTX 5060 Ti AI, ChatGPT alternative, Claude alternative, Gemini alternative, Copilot alternative, AI for coding, AI code reviewer, AI study buddy, AI career coach, AI trip planner, AI writing assistant, AI homework help, AI math solver, AI essay writer, AI translator, AI summarizer, AI email writer, AI resume builder, AI recipe generator, AI weather assistant, weather today, what is the weather, ask AI anything, chat with AI, talk to AI, best free AI, fastest AI chatbot, no signup AI, AI without login, AI for students, AI for developers, AI for writers, AI for business, AI for teachers, small AI model, cheap AI, low cost AI, offline capable AI, open AI alternative, Devansh AI, DAP AI Dubai, DAP AI UAE, how does AI work, what is a language model, what is an SLM, run AI at home, AI on Jetson, AI on gaming GPU",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "DAP AI — Free AI Chatbot & Small Language Model" },
      {
        property: "og:description",
        content:
          "A free mixture-of-experts AI chatbot — 15-23 experts of roughly 7-9B parameters each — running on hardware we own. Answers weather, news, code, study, writing, recipes, travel, and everyday questions.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dapai.lovable.app/about-dap-ai" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "DAP AI — Free AI Chatbot & Small Language Model" },
      {
        name: "twitter:description",
        content:
          "Free chatbot for weather, code, study, writing, recipes, travel, and more. A mixture-of-experts model with 15-23 experts of roughly 7-9B parameters each.",
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
          "@graph": [
            {
              "@type": "SoftwareApplication",
              name: "DAP AI",
              alternateName: ["DAP AI 3.2", "DAP AI Pro", "DAP AI Lite", "dapai", "DAP"],
              applicationCategory: "Chatbot",
              operatingSystem: "Web",
              url: "https://dapai.lovable.app",
              description:
                "DAP AI is a free mixture-of-experts AI chatbot. Depending on the plan it routes across 15 to 23 experts, each roughly 7-9B parameters, running on hardware we own.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "What is DAP AI?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "DAP AI is a free AI chatbot built as a mixture-of-experts model. Depending on your plan it routes across 15 to 23 experts, each roughly 7-9B parameters, running on hardware we own rather than a rented datacenter.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can DAP AI tell me the weather?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "You can ask DAP AI about the weather, news, sports, recipes, travel plans, homework, coding help, and just about anything else you'd ask a chatbot.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is DAP AI free?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. DAP AI Lite is free forever. DAP AI 3.2 (Pro) unlocks longer memory, custom personas (Gems), web search, and image input.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is DAP AI a ChatGPT, Claude, or Gemini alternative?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes — DAP AI is a lightweight alternative to ChatGPT, Claude, Gemini, and Copilot. It's smaller and faster, designed to run on consumer hardware instead of hyperscaler datacenters.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What can I use DAP AI for?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Coding help, code review, studying, homework, math, essay writing, email drafting, resume writing, trip planning, recipes, translation, summarization, career coaching, and everyday questions.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],

  }),
  component: AboutDapAi,
});

/**
 * The hardware reveal ships as a standalone document (public/dap-hardware-reveal.html)
 * so it can also be opened on its own. It is framed rather than ported
 * because it sets its own `html, body` rules and locks scrolling — an
 * iframe keeps that sealed off from the app shell, and keeps one copy
 * of the animation rather than two.
 *
 * The `?v=` is a cache buster. An earlier build shipped a version that
 * fetched Anime.js from a CDN and showed an error when the fetch failed;
 * bumping this on every change to the reveal guarantees nobody keeps
 * being served the broken copy out of their browser cache.
 */
const REVEAL_SRC = "/dap-hardware-reveal.html?v=2";

function HardwareReveal() {
  return (
    <section className="w-full">
      <div className="overflow-hidden border-b border-border bg-black">
        <iframe
          src={REVEAL_SRC}
          title="DAP AI hardware reveal — a cluster of two NVIDIA Jetson Orin Nano boards"
          className="block h-[88vh] min-h-[420px] w-full border-0"
          loading="eager"
        />
      </div>
      <p className="px-6 pt-3 text-center text-xs text-muted-foreground">
        The machine DAP AI runs on — hover the hardware to explore it, or open the{" "}
        <a
          href={REVEAL_SRC}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          full-screen reveal
        </a>
        . Scroll on for the rest.
      </p>
    </section>
  );
}

function AboutDapAi() {
  return (
    <>
      <HardwareReveal />
      <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">About DAP AI</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        DAP AI is a <strong>mixture-of-experts</strong> model. Depending on your
        plan it routes across <strong>15 to 23 experts</strong>, each roughly{" "}
        <strong>7-9 billion parameters</strong> — and it runs on hardware we own.
        No datacenter, no cloud GPU bill, no racks of H100s.
      </p>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">What DAP AI is</h2>
        <p className="mt-3 text-muted-foreground">
          DAP AI is an efficient conversational model built for everyday chat,
          coding help, writing, and study questions. Rather than one dense
          model doing everything, it uses a <em>mixture of experts</em>: many
          smaller specialist models, with only the few best suited to your
          question actually running on any given reply.
        </p>
        <p className="mt-3 text-muted-foreground">
          The pool holds <strong>15 to 23 experts depending on your plan</strong>,
          each roughly <strong>7-9 billion parameters</strong>. Because only a
          handful activate per message, answers come back quickly and cheaply
          while the pool as a whole covers far more ground than any single
          model that size could.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">The hardware it runs on</h2>
        <p className="mt-3 text-muted-foreground">
          The entire DAP AI service runs on:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
          <li>
            <strong>1× NVIDIA GeForce RTX 5060 Ti</strong> — a consumer gaming
            GPU, not a datacenter card.
          </li>
          <li>
            <strong>2× NVIDIA Jetson Orin Nano</strong> — small edge devices
            roughly the size of a paperback book.
          </li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          That's it. No datacenter, no server farm, no enterprise contract.
          The whole stack fits on a desk and draws less power than a hair
          dryer.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Why a small model?</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
          <li>
            <strong>It's fast.</strong> Small models respond quickly because
            there's less math to do per token.
          </li>
          <li>
            <strong>It's cheap to run.</strong> No $20k GPUs, no per-token
            cloud bills. That's why DAP AI Lite can be free.
          </li>
          <li>
            <strong>It's private.</strong> Your messages never leave hardware
            we control — they're not handed off to OpenAI, Anthropic, or
            Google.
          </li>
          <li>
            <strong>It's proof that you don't need a datacenter.</strong>{" "}
            Useful AI does not have to be exclusive to billion-dollar
            companies.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Tiers</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
          <li>
            <strong>DAP AI Lite</strong> — free. Fast replies for quick
            questions and chat.
          </li>
          <li>
            <strong>DAP AI 3.2 (Pro)</strong> — the smarter tuned variant
            with longer memory, custom DAPs (personas), web search, and
            image input.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Ask DAP AI anything</h2>
        <p className="mt-3 text-muted-foreground">
          DAP AI is a general-purpose chatbot. People use it to ask questions like:
        </p>
        <ul className="mt-3 grid list-disc grid-cols-1 gap-x-6 gap-y-2 pl-6 text-muted-foreground sm:grid-cols-2">
          <li>What's the weather today?</li>
          <li>What's the weather tomorrow in Dubai?</li>
          <li>Latest news headlines</li>
          <li>Explain quantum physics simply</li>
          <li>Write a Python function to sort a list</li>
          <li>Review my JavaScript code</li>
          <li>Help me with my math homework</li>
          <li>Solve this algebra problem</li>
          <li>Write an essay about climate change</li>
          <li>Draft a professional email</li>
          <li>Fix the grammar in this paragraph</li>
          <li>Translate this sentence to Spanish</li>
          <li>Summarize this article for me</li>
          <li>Give me a recipe for chicken curry</li>
          <li>Plan a 3-day trip to Tokyo</li>
          <li>Build me a workout routine</li>
          <li>Help me write my resume</li>
          <li>Career advice for a software engineer</li>
          <li>What should I learn next in web development?</li>
          <li>Explain this error message</li>
          <li>Generate startup ideas</li>
          <li>Write a poem about the ocean</li>
          <li>What is a small language model?</li>
          <li>Best free ChatGPT alternative</li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          Weather, news, code, homework, recipes, travel, writing — if you'd
          ask ChatGPT, Claude, Gemini, or Copilot, you can ask DAP AI.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
        <div className="mt-4 space-y-4 text-muted-foreground">
          <div>
            <h3 className="font-medium text-foreground">Is DAP AI free?</h3>
            <p>Yes. DAP AI Lite is free forever. Pro unlocks longer memory, custom personas, web search, and image input.</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Can DAP AI tell me the weather?</h3>
            <p>Yes — ask about the weather, news, sports scores, recipes, travel, homework, coding, and just about anything else.</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Is DAP AI a ChatGPT alternative?</h3>
            <p>Yes. It's a lightweight alternative to ChatGPT, Claude, Gemini, and Copilot, designed to run on consumer hardware rather than a hyperscaler datacenter.</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Do I need to sign up?</h3>
            <p>You can try DAP AI Lite without an account. Sign up to save chats and unlock Pro features.</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Is my data private?</h3>
            <p>Your messages stay on hardware we control — they aren't forwarded to OpenAI, Anthropic, or Google.</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">The bigger idea</h2>
        <p className="mt-3 text-muted-foreground">
          Most AI you use today is rented from a handful of giant cloud
          providers. DAP AI is a small experiment in the opposite direction:
          a useful chatbot, served from a few small machines, that proves
          you don't need a hyperscaler to make AI happen.
        </p>
      </section>


      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          to="/"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try DAP AI
        </Link>
        <Link
          to="/terms"
          className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Back to Terms
        </Link>
      </div>
      </div>
    </>
  );
}
