import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { SuggestionChips } from "@/components/chat-composer";
import { ChatComposer } from "@/components/chat-composer";
import { createChat, sendChatMessage } from "@/lib/chats.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
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
];

function Home() {
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const [greeting, setGreeting] = useState<string>("");
  const create = useServerFn(createChat);
  const send = useServerFn(sendChatMessage);

  useEffect(() => {
    const finalName = user?.name || "friend";
    const list = GREETINGS(finalName);
    setGreeting(list[Math.floor(Math.random() * list.length)]);
  }, [user]);

  const startChat = useMutation({
    mutationFn: async (text: string) => {
      const chat = await create();
      const model =
        (typeof window !== "undefined"
          ? localStorage.getItem("dap.model")
          : null) || "dap-ai-1.0";
      await send({
        data: {
          chatId: chat.id,
          text,
          model: model === "dap-ai-lite" ? "dap-ai-lite" : "dap-ai-1.0",
        },
      });
      return chat.id;
    },
    onSuccess: (chatId) => {
      navigate({ to: "/c/$threadId", params: { threadId: chatId } });
    },
  });

  const handleSend = (text: string) => {
    if (!user) {
      navigate({ to: "/signup" });
      return;
    }
    startChat.mutate(text);
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
            className="mb-4 h-40 w-40 rounded-2xl object-cover shadow-lg"
          />
          <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            {greeting}
          </h1>

          {!user && ready && (
            <p className="mt-3 text-sm text-muted-foreground">
              <Link to="/signup" className="font-medium text-foreground underline">
                Create an account
              </Link>{" "}
              to save chats and use DAP AI 3.2 (5 free messages, then Lite).
            </p>
          )}

          <div className="mt-10 w-full">
            {!ready ? (
              <div className="flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <SuggestionChips onPick={handleSend} />
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur">
        {user ? (
          <ChatComposer onSend={handleSend} />
        ) : (
          <div className="mx-auto max-w-3xl text-center">
            <Button asChild style={{ background: "var(--gradient-brand)" }}>
              <Link to="/signup">Sign up to start chatting</Link>
            </Button>
          </div>
        )}
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
          DAP AI may produce inaccurate info.
        </p>
      </div>
    </div>
  );
}
