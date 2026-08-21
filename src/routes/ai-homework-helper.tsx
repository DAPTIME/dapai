import { createFileRoute, Link } from "@tanstack/react-router";

const URL = "https://dapai.lovable.app/ai-homework-helper";
const TITLE = "Free AI Homework Helper — DAP AI";
const DESCRIPTION =
  "A free AI homework helper for maths, science, essays and reading. Ask a question, get worked steps and explanations — your first message needs no account.";

const SUBJECTS: { subject: string; ask: string; get: string }[] = [
  {
    subject: "Maths",
    ask: "Paste the problem, or type it out.",
    get: "Step-by-step working with the rule used at each line, so you can follow the method on the next question.",
  },
  {
    subject: "Science",
    ask: "Ask why something happens, not just what happens.",
    get: "A plain-language explanation, then the textbook wording, so you can write it in your own words.",
  },
  {
    subject: "Essays & English",
    ask: "Give the prompt and your draft or notes.",
    get: "An outline, feedback on your argument, and rewrite suggestions — it will not hand you a finished essay to submit.",
  },
  {
    subject: "Reading & research",
    ask: "Paste an article, chapter or set of notes.",
    get: "A summary, the key terms defined, and practice questions to test yourself with.",
  },
  {
    subject: "Coding",
    ask: "Paste the code and the error.",
    get: "What the error means, where it comes from, and a fix you can explain to your teacher.",
  },
  {
    subject: "Revision",
    ask: "Name the topic and your exam date.",
    get: "Flashcard-style questions and a short quiz, repeated until the answers stick.",
  },
];

const STEPS = [
  "Open the chat and type your question — the first message works without an account.",
  "Add context: your year group, the method your class uses, and what you have already tried.",
  "Ask follow-ups. The thread keeps the whole conversation, so you can say \"explain step 3 again\".",
  "Create a free account when you want your chats saved for later revision.",
];

export const Route = createFileRoute("/ai-homework-helper")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "free ai homework helper, ai homework help, homework helper, ai math solver, ai study helper, free ai tutor, ai essay feedback",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to use a free AI homework helper",
          description: DESCRIPTION,
          url: URL,
          step: STEPS.map((text, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            text,
          })),
        }),
      },
    ],
  }),
  component: HomeworkHelper,
});

function HomeworkHelper() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        For students
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Free AI homework helper
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        DAP AI answers homework questions and shows the working, so you learn the
        method instead of copying an answer. It is free to use, works on a phone,
        and your first message needs no account.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm font-medium">
        <Link
          to="/"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Ask a homework question
        </Link>
        <Link
          to="/help"
          className="rounded-md border border-border px-4 py-2 text-foreground transition-colors hover:bg-muted"
        >
          Help &amp; FAQ
        </Link>
      </div>

      <h2 className="mt-10 text-xl font-semibold">What it helps with</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-foreground">
            <tr>
              <th scope="col" className="p-3 font-semibold">
                Subject
              </th>
              <th scope="col" className="p-3 font-semibold">
                What to send
              </th>
              <th scope="col" className="p-3 font-semibold">
                What you get back
              </th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {SUBJECTS.map((row) => (
              <tr key={row.subject} className="border-t border-border align-top">
                <th scope="row" className="p-3 font-medium text-foreground">
                  {row.subject}
                </th>
                <td className="p-3">{row.ask}</td>
                <td className="p-3">{row.get}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">How to use it</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      <h2 className="mt-10 text-xl font-semibold">Use it honestly</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Most schools allow AI for explaining, checking and revising, and treat
          submitting generated work as plagiarism. Ask for the method, then write
          the answer yourself in your own words.
        </p>
        <p>
          DAP AI is AI and can make mistakes, so check any figure, date or formula
          against your textbook before you hand work in.
        </p>
      </div>

      <div className="mt-10 rounded-lg border border-border bg-muted/40 p-5">
        <h2 className="text-lg font-semibold">Study with other people</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Study Rooms let you share a chat with classmates so everyone sees the
          same explanation while you revise together.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
          <Link
            to="/rooms"
            className="rounded-md border border-border px-4 py-2 text-foreground transition-colors hover:bg-muted"
          >
            Open Study Rooms
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
