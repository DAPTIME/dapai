import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChatComposer, SuggestionChips } from "@/components/chat-composer";
import { loadConfig } from "@/lib/ai-config";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — Your AI workspace" },
      { name: "description", content: "Start a conversation with Lumen." },
    ],
  }),
  component: Home,
});

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
}

function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

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
          text: "No AI connected yet. Open Admin to point Lumen at your own GPU (Ollama / LM Studio).",
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
          <div className="mx-auto flex h-full max-w-3xl flex-col justify-center px-4 py-10">
            <h1
              className="bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              Hello there.
            </h1>
            <p className="mt-2 text-2xl text-muted-foreground sm:text-3xl">
              How can I help you today?
            </p>
            <div className="mt-10">
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
                    {m.role === "user" ? "You" : "Lumen"}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-foreground">{m.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur">
        <ChatComposer onSend={handleSend} />
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
          Lumen may produce inaccurate info. This is a UI preview — AI is not connected yet.
        </p>
      </div>
    </div>
  );
}
