import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { SuggestionChips, ChatComposer } from "@/components/chat-composer";
import { createChat } from "@/lib/chats.functions";
import { getSiteStatus } from "@/lib/admin.functions";

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
      { title: "DAP AI — Free AI Chatbot" },
      {
        name: "description",
        content:
          "DAP AI is a fast, friendly AI chatbot and workspace for answers, writing, studying, coding, and custom AI assistants called DAPs.",
      },
      { name: "keywords", content: "DAP AI, DAPAI, AI chatbot, free AI chat, AI assistant, DAPs" },
      { property: "og:title", content: "DAP AI — Free AI Chatbot" },
      {
        property: "og:description",
        content:
          "Chat with DAP AI for fast answers, writing help, studying, coding, and custom AI assistants.",
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
    links: [
      { rel: "canonical", href: "https://dapai.lovable.app/" },
      { rel: "preload", as: "image", href: logo.url, fetchpriority: "high" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: "DAP AI",
          serviceType: "AI chat assistant",
          provider: { "@type": "Organization", name: "DAP AI" },
          description:
            "A fast AI chatbot and workspace for answers, writing, studying, coding, and custom AI assistants called DAPs.",
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
  const fetchSiteStatus = useServerFn(getSiteStatus);
  const siteStatus = useQuery({
    queryKey: ["site-status"],
    queryFn: () => fetchSiteStatus(),
    refetchInterval: 30_000,
  });
  const siteEnabled = siteStatus.data?.enabled !== false;




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
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <div className="relative mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 py-4 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 home-aurora"
          />
          <img
            src={logo.url}
            alt="DAP AI"
            width={512}
            height={512}
            loading="eager"
            // @ts-expect-error fetchpriority is a valid HTML attribute
            fetchpriority="high"
            decoding="async"
            className="mb-3 h-[min(18vh,7rem)] w-[min(18vh,7rem)] object-contain home-logo-shadow"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 home-aurora"
          />
          <img
            src={logo.url}
            alt="DAP AI"
            width={512}
            height={512}
            loading="eager"
            // @ts-expect-error fetchpriority is a valid HTML attribute
            fetchpriority="high"
            decoding="async"
            className="mb-6 h-[min(25vw,10rem)] w-[min(25vw,10rem)] object-contain home-logo-shadow"
          />


          <h1
            className="text-4xl font-semibold tracking-tight sm:text-5xl"
            style={{
              backgroundImage: "var(--gradient-text)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            DAP AI
          </h1>


          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            {greeting} DAP AI is a fast AI chatbot for answers, writing, studying,
            coding, and custom AI assistants.
          </p>

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
            ) : siteEnabled ? (
              <section aria-labelledby="suggestions-heading">
                <h2 id="suggestions-heading" className="sr-only">
                  Conversation starters
                </h2>
                <SuggestionChips onPick={handleSend} />
              </section>
            ) : null}
          </div>
        </div>
      </div>
      <div className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur">
        {!ready || siteStatus.isLoading ? (
          <div className="mx-auto flex max-w-3xl justify-center py-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !siteEnabled ? (
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              DAP AI is undergoing major reworks
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Please try again later.
            </p>
          </div>
        ) : (
          <section aria-labelledby="composer-heading">
            <h2 id="composer-heading" className="sr-only">
              Message DAP AI
            </h2>
            <ChatComposer onSend={handleSend} />
          </section>
        )}
        {siteEnabled && (
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
            DAP AI may produce inaccurate info.
          </p>
        )}
      </div>

      <Dialog open={signupOpen} onOpenChange={setSignupOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign up to start chatting</DialogTitle>
            <DialogDescription>
              Create a free account to chat with DAP AI and save your conversations.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Create account</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
