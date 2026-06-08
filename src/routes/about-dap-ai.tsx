import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about-dap-ai")({
  head: () => ({
    meta: [
      {
        title:
          "About DAP AI — A Small Language Model You Can Actually Run",
      },
      {
        name: "description",
        content:
          "DAP AI is a ~100M parameter small language model, roughly as capable as Gemma E2B, that runs on a single RTX 5060 Ti and two Jetson Orin Nanos — no datacenter required.",
      },
      {
        name: "keywords",
        content:
          "DAP AI, dap ai, dapai, DAP AI 3.2, DAP AI Pro, DAP AI Lite, small language model, SLM, 100M parameter model, Gemma E2B alternative, edge AI, Jetson Orin Nano, RTX 5060 Ti, on-device AI, self-hosted AI, free AI chatbot",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "About DAP AI — Small Language Model" },
      {
        property: "og:description",
        content:
          "A ~100M parameter small language model that runs on consumer hardware. No datacenter, no cloud GPU bill.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dapai.lovable.app/about-dap-ai" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "About DAP AI — Small Language Model" },
      {
        name: "twitter:description",
        content:
          "A ~100M parameter SLM running on one 5060 Ti and two Jetson Orin Nanos.",
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
            "DAP AI is a ~100M parameter small language model, comparable to Gemma E2B, running on consumer hardware (one RTX 5060 Ti and two Jetson Orin Nanos) — no datacenter required.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: AboutDapAi,
});

function AboutDapAi() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 text-sm text-muted-foreground">
        <Link to="/terms" className="underline hover:text-foreground">
          ← Back to Terms
        </Link>
      </div>

      <h1 className="text-4xl font-semibold tracking-tight">About DAP AI</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        DAP AI is a <strong>small language model</strong> — around{" "}
        <strong>100 million parameters</strong> — designed to be roughly as
        capable as models like <strong>Gemma E2B</strong>, while running
        entirely on consumer hardware. No datacenter, no cloud GPU bill, no
        racks of H100s.
      </p>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold">What DAP AI is</h2>
        <p className="mt-3 text-muted-foreground">
          DAP AI is a compact, efficient language model built for everyday
          chat, coding help, writing, and study questions. It belongs to the
          new wave of <em>small language models</em> (SLMs) — models that
          deliberately trade raw size for speed, cost, and the ability to run
          on hardware you can actually buy at a store.
        </p>
        <p className="mt-3 text-muted-foreground">
          At ~100M parameters, DAP AI is dramatically smaller than frontier
          models like GPT-4 or Claude (often hundreds of billions of
          parameters), but punches well above its weight thanks to careful
          training and tuning. Its target quality bar is{" "}
          <strong>Gemma E2B</strong>-class — meaning useful, coherent answers
          for the kinds of questions people actually ask a chatbot.
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
  );
}
