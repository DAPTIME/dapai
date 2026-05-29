import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChatComposer, SuggestionChips } from "@/components/chat-composer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — Your AI workspace" },
      { name: "description", content: "Start a conversation with Lumen, your friendly AI assistant." },
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

  const handleSend = (text: string) => {
    setMessages((m) => [
      ...m,
      { id: m.length, role: "user", text },
      {
        id: m.length + 1,
        role: "assistant",
        text: "AI isn't wired up yet — your message has been received. Once connected, Lumen will reply here.",
      },
    ]);
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
