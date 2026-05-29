import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ChatComposer, SuggestionChips } from "@/components/chat-composer";
import { loadConfig } from "@/lib/ai-config";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ascend — Your AI workspace" },
      { name: "description", content: "Your personal AI assistant." },
    ],
  }),
  component: Home,
});

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const GREETINGS = (name: string) => [
  `Hey ${name}, I'm here to help.`,
  `What's on your mind, ${name}?`,
  `Ready when you are, ${name}.`,
  `Let's get into it, ${name}.`,
  `How can I assist, ${name}?`,
  `Ask me anything, ${name}.`,
  `At your service, ${name}.`,
  `What are we building today, ${name}?`,
  `Hi ${name}, fire away.`,
  `Good to see you, ${name}.`,
];

function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("friend");
  const [greeting, setGreeting] = useState<string>("");

  useEffect(() => {
    const n = typeof window !== "undefined" ? localStorage.getItem("ascend.name") : null;
    const finalName = n || "friend";
    if (n) setName(finalName);
    const list = GREETINGS(finalName);
    setGreeting(list[Math.floor(Math.random() * list.length)]);
  }, []);


  const handleSend = async (text: string) => {
    const cfg = loadConfig();
    const userMsg: Msg = { id: Date.now(), role: "user", text };
    setMessages((m) => [...m, userMsg]);

    if (!cfg.enabled) {
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: "No AI connected yet. Open Admin to point Ascend at your own GPU (Ollama / LM Studio).",
        },
      ]);
      return;
    }

    setBusy(true);
    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.text,
    }));
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: cfg.model, messages: history, stream: false }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const reply =
        data?.choices?.[0]?.message?.content ??
        data?.message?.content ??
        "(empty response)";
      setMessages((m) => [...m, { id: Date.now() + 2, role: "assistant", text: reply }]);
    } catch (e) {
      toast.error("Couldn't reach your AI endpoint. Check Admin settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="relative mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(ellipse 60% 40% at 50% 50%, oklch(0.35 0.18 260 / 0.55), transparent 70%)",
              }}
            />
            <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              {greeting}
            </h1>
            <div className="mt-10 w-full">
              <SuggestionChips onPick={handleSend} />
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            {messages.map((m) => (
              <div key={m.id} className="flex gap-3">
                <div
                  className="mt-1 h-8 w-8 shrink-0 rounded-full"
                  style={{
                    background:
                      m.role === "user" ? "oklch(0.85 0.04 255)" : "var(--gradient-brand)",
                  }}
                />
                <div className="flex-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    {m.role === "user" ? "You" : "Ascend"}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-foreground">{m.text}</div>
                </div>
              </div>
            ))}
            {busy && <div className="text-sm text-muted-foreground">Thinking…</div>}
          </div>
        )}
      </div>
      <div className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur">
        <ChatComposer onSend={handleSend} />
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
          Ascend may produce inaccurate info.
        </p>
      </div>
    </div>
  );
}
