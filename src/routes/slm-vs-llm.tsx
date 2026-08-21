import { createFileRoute, Link } from "@tanstack/react-router";

const URL = "https://dapai.lovable.app/slm-vs-llm";
const TITLE = "SLM vs LLM: Small vs Large Language Models Compared";
const DESCRIPTION =
  "SLM vs LLM explained: how small language models differ from large ones in size, speed, cost, privacy and hardware — from a chatbot we run on NVIDIA Jetson boards.";

export const Route = createFileRoute("/slm-vs-llm")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "slm vs llm, small language model, large language model, what is an slm, slm meaning, edge ai, on-device ai, local ai, private ai, jetson orin nano ai, small language model chatbot",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: TITLE,
              description: DESCRIPTION,
              url: URL,
              inLanguage: "en",
              about: ["Small language models", "Large language models"],
              publisher: {
                "@type": "Organization",
                name: "DAP AI",
                url: "https://dapai.lovable.app",
              },
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "What is the difference between an SLM and an LLM?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "An SLM (small language model) has far fewer parameters than an LLM (large language model), so it fits in a few gigabytes of memory and can run on a single consumer device. An LLM has tens or hundreds of billions of parameters and normally needs datacenter GPUs, so it is reached over an API. SLMs trade breadth of world knowledge for speed, cost and the ability to run privately on hardware you own.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is an SLM good enough for everyday chat?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "For everyday questions, drafting, summarising, explaining concepts, and routine coding help, a small model is usually enough. Long multi-step reasoning, deep niche knowledge, and very long documents are where a large model still pulls ahead.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can a small language model run on a NVIDIA Jetson Orin Nano?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. DAP AI serves its models from NVIDIA Jetson Orin Nano edge boards rather than rented datacenter GPUs, which is why replies are queued per tier and can take longer than a hyperscaler API, but never leave hardware we control.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Are SLMs more private than LLMs?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "They can be, because a small model can run on hardware you own. Privacy comes from where the model runs, not from its size — an SLM served by a third-party API is no more private than an LLM served the same way.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: SlmVsLlm,
});

type Row = { label: string; slm: string; llm: string };

const ROWS: Row[] = [
  {
    label: "Typical size",
    slm: "Roughly 0.5B–8B parameters; a few GB once quantised",
    llm: "Tens to hundreds of billions of parameters",
  },
  {
    label: "Where it runs",
    slm: "A single consumer device: laptop, mini PC, or an edge board like a Jetson Orin Nano",
    llm: "Clusters of datacenter GPUs, reached over an API",
  },
  {
    label: "Latency",
    slm: "Fast per token on modest hardware, but throughput is limited — one request at a time on a single board",
    llm: "Fast and massively parallel, because the capacity is rented and shared",
  },
  {
    label: "Running cost",
    slm: "Electricity plus the one-off hardware you already bought",
    llm: "Per-token billing that scales with every message",
  },
  {
    label: "Privacy",
    slm: "Prompts can stay on hardware you physically control",
    llm: "Prompts leave your network and land with the provider",
  },
  {
    label: "Breadth of knowledge",
    slm: "Narrower; strongest when focused on a task or given context",
    llm: "Broader recall across niche topics and languages",
  },
  {
    label: "Long, multi-step reasoning",
    slm: "Weaker — keep tasks short and concrete",
    llm: "Stronger, and the usual reason to reach for one",
  },
  {
    label: "Offline use",
    slm: "Works with no internet once the weights are local",
    llm: "Needs a live connection to the provider",
  },
];

function SlmVsLlm() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Explainer
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        SLM vs LLM: small and large language models, compared
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        Both are the same kind of thing — a neural network trained to predict text.
        The difference is scale, and scale decides everything practical: what
        hardware you need, what a reply costs, how long it takes, and whether your
        prompt ever leaves the room. We care about this because DAP AI is not
        served from a rented cloud; our models run on two NVIDIA Jetson Orin Nano
        edge boards we own.
      </p>

      <h2 className="mt-10 text-xl font-semibold">The short answer</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
        <li>
          <strong className="text-foreground">An SLM</strong> (small language
          model) is small enough to load onto one device you own. You trade some
          breadth of knowledge and long-form reasoning for speed, near-zero
          marginal cost, offline capability and real privacy.
        </li>
        <li>
          <strong className="text-foreground">An LLM</strong> (large language
          model) is too big for that. It lives on datacenter GPUs and you rent
          access per token. You get broader knowledge and stronger multi-step
          reasoning, and your prompts go to somebody else's machines.
        </li>
        <li>
          Privacy is about <em>where</em> a model runs, not how big it is. A small
          model behind someone else's API is no more private than a large one.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Side by side</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-foreground">
            <tr>
              <th scope="col" className="p-3 font-semibold">
                &nbsp;
              </th>
              <th scope="col" className="p-3 font-semibold">
                Small language model (SLM)
              </th>
              <th scope="col" className="p-3 font-semibold">
                Large language model (LLM)
              </th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-border align-top">
                <th scope="row" className="p-3 font-medium text-foreground">
                  {row.label}
                </th>
                <td className="p-3">{row.slm}</td>
                <td className="p-3">{row.llm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">
        What running an SLM on real hardware actually feels like
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          This is the part benchmarks leave out. A Jetson Orin Nano is a small
          board with shared memory, not a rack of GPUs, and that shapes the
          product in three visible ways.
        </p>
        <p>
          <strong className="text-foreground">Throughput, not speed, is the
          limit.</strong> Tokens come out at a perfectly usable rate, but the
          board serves one request at a time. So DAP AI queues messages in
          fairness lanes by plan rather than pretending capacity is infinite —
          you see your place in the queue instead of a silent timeout.
        </p>
        <p>
          <strong className="text-foreground">Memory sets the context
          budget.</strong> Weights and conversation history compete for the same
          few gigabytes, so history depth is tuned per plan rather than dumping
          an entire chat into every request.
        </p>
        <p>
          <strong className="text-foreground">Nothing is forwarded.</strong>
          {" "}Your messages are answered by our boards; they are not relayed to
          OpenAI, Anthropic or Google. That is the payoff for the two constraints
          above, and it is not something a rented API can offer.
        </p>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Which should you use?</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">Pick a small model</strong> for
          everyday questions, drafting and rewriting, summarising text you paste
          in, explaining concepts, routine coding help, and anything you would
          rather not send to a third party.
        </p>
        <p>
          <strong className="text-foreground">Pick a large model</strong> for long
          multi-step reasoning, obscure factual recall, very long documents, and
          work across many languages at once.
        </p>
        <p>
          In practice most people want both, and the honest routing rule is
          simple: default to the small model, and escalate only when a task
          visibly needs more.
        </p>
      </div>

      <div className="mt-10 rounded-lg border border-border bg-muted/40 p-5">
        <h2 className="text-lg font-semibold">Try a small language model now</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          DAP AI 4 Lite is a small model served from our own hardware, free to
          use, and your first message needs no account.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
          <Link
            to="/"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start a chat
          </Link>
          <Link
            to="/about-dap-ai"
            className="rounded-md border border-border px-4 py-2 text-foreground transition-colors hover:bg-muted"
          >
            How DAP AI is built
          </Link>
        </div>
      </div>
    </div>
  );
}
