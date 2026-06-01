import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ChatComposer, SuggestionChips } from "@/components/chat-composer";
import { createThread, appendMessage } from "@/lib/chats";
import logo from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DAP AI — Your AI workspace" },
      { name: "description", content: "Your personal AI assistant." },
    ],
  }),
  component: Home,
});

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
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState<string>("");

  useEffect(() => {
    const n =
      typeof window !== "undefined" ? localStorage.getItem("ascend.name") : null;
    const finalName = n || "friend";
    const list = GREETINGS(finalName);
    setGreeting(list[Math.floor(Math.random() * list.length)]);
  }, []);

  const handleSend = (text: string) => {
    const t = createThread();
    appendMessage(t.id, { id: Date.now(), role: "user", text });
    navigate({ to: "/c/$threadId", params: { threadId: t.id } });
  };


  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="relative mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 60% 40% at 50% 50%, oklch(0.35 0.18 260 / 0.55), transparent 70%)",
            }}
          />
          <img
            src={logo.url}
            alt="DAP AI"
            className="mb-4 h-20 w-20 rounded-2xl object-cover shadow-lg"
          />
          <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            {greeting}
          </h1>
          <div className="mt-10 w-full">
            <SuggestionChips onPick={handleSend} />
          </div>
        </div>
      </div>
      <div className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur">
        <ChatComposer onSend={handleSend} />
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
          DAP AI may produce inaccurate info.
        </p>
      </div>
    </div>
  );
}
