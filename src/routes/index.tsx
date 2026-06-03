import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { SuggestionChips, ChatComposer } from "@/components/chat-composer";
import { createChat } from "@/lib/chats.functions";

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import logo from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DAP AI — Your AI workspace" },
      {
        name: "description",
        content:
          "DAP AI is your personal AI workspace for fast, friendly chat and productivity assistance. Switch between Pro and Lite models or pick a specialized DAP.",
      },
      { property: "og:title", content: "DAP AI — Your AI workspace" },
      {
        property: "og:description",
        content:
          "Chat with DAP AI — your personal AI workspace for productivity, learning, and creative work.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/" },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d4ddeeda-a5fa-491c-98ac-e5bf7f678179/id-preview-60df72d6--4e5794db-69e7-4998-9ede-a9b885182642.lovable.app-1780308353128.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d4ddeeda-a5fa-491c-98ac-e5bf7f678179/id-preview-60df72d6--4e5794db-69e7-4998-9ede-a9b885182642.lovable.app-1780308353128.png",
      },
    ],
    links: [{ rel: "canonical", href: "https://dapai.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: "DAP AI",
          serviceType: "AI chat assistant",
          provider: { "@type": "Organization", name: "DAP AI" },
          url: "https://dapai.lovable.app/",
        }),
      },
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
  const [signupOpen, setSignupOpen] = useState(false);
  const create = useServerFn(createChat);


  useEffect(() => {
    const finalName = user?.name || "friend";
    const list = GREETINGS(finalName);
    setGreeting(list[Math.floor(Math.random() * list.length)]);
  }, [user]);

  const startChat = useMutation({
    mutationFn: async (payload: { text: string; images?: string[] }) => {
      const chat = await create();
      // Stash pending message so the chat route auto-sends after navigation.
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          `dap.pending.${chat.id}`,
          JSON.stringify(payload)
        );
      }
      return chat.id;
    },
    onSuccess: (chatId) => {
      navigate({ to: "/c/$threadId", params: { threadId: chatId } });
    },
  });

  const handleSend = (text: string, images?: string[]) => {
    if (!user) {
      setSignupOpen(true);
      return;
    }
    startChat.mutate({ text, images });
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
            width={512}
            height={512}
            loading="eager"
            decoding="async"
            className="mb-6 h-[min(25vw,10rem)] w-[min(25vw,10rem)] object-contain drop-shadow-[0_10px_40px_oklch(0.55_0.22_280/0.45)]"
          />

          <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            {greeting}
          </h1>

          {!user && ready && (
            <p className="mt-3 text-sm text-muted-foreground">
              <Link to="/signup" className="font-medium text-foreground underline">
                Create an account
              </Link>{" "}
              to save chats and use DAP AI 3.2.
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
        {!ready ? (
          <div className="mx-auto flex max-w-3xl justify-center py-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <ChatComposer onSend={handleSend} />
        )}
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
          DAP AI may produce inaccurate info.
        </p>
      </div>
    </div>
  );
}
