import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ChatComposer } from "@/components/chat-composer";
import logo from "@/assets/logo.png.asset.json";
import { getChat, sendChatMessage, stopChatMessage, getProfile, planSearchForMessage } from "@/lib/chats.functions";
import { modelInfo, type ModelId } from "@/lib/models";
import { useSiteConfig } from "@/lib/site-config";
import { useAuth } from "@/lib/auth";
import { sanitizeLiteReply } from "@/lib/lite-sanitize";
import { MarkdownMessage } from "@/components/markdown-message";
import { trackAiReply } from "@/lib/ai-reply-notifier";

export const Route = createFileRoute("/c/$threadId")({
  head: () => ({
    meta: [
      { title: "Chat — DAP AI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading, ready } = useAuth();
  const qc = useQueryClient();
  const fetchChat = useServerFn(getChat);
  const fetchProfile = useServerFn(getProfile);
  const send = useServerFn(sendChatMessage);
  const stop = useServerFn(stopChatMessage);
  const planSearch = useServerFn(planSearchForMessage);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<{
    id: string;
    role: "user";
    content: string;
    model: ModelId;
    created_at: string;
  } | null>(null);

  useEffect(() => {
    if (ready && !loading && !user) navigate({ to: "/login" });
  }, [ready, loading, user, navigate]);

  const chatQuery = useQuery({
    queryKey: ["chat", threadId],
    queryFn: () => fetchChat({ data: { chatId: threadId } }),
    enabled: !!user,
  });

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });
  const siteConfig = useSiteConfig();
  const siteEnabled = siteConfig.enabled;
  const proEnabled = siteConfig.flags.pro_model;
  const liteEnabled = siteConfig.flags.lite_model;

  const tier = (profileQuery.data?.tier as "free" | "pro" | undefined) ?? "free";
  const maintenance = tier === "pro"
    ? !proEnabled && !liteEnabled
    : !liteEnabled;

  const sendMut = useMutation({
    mutationFn: async ({ text, images }: { text: string; images?: string[] }) => {
      const model =
        (typeof window !== "undefined"
          ? localStorage.getItem("dap.model")
          : null) || "dap-ai-1.0";
      const effective = (modelInfo(model)?.id ?? "dap-ai-lite") as ModelId;

      // Optimistically show the user's message in the transcript right away
      // so they don't stare at a blank "Thinking…" while we wait for the model.
      const imageCount = images?.length ?? 0;
      const storedContent =
        imageCount > 0
          ? `${text}\n\n_(📎 ${imageCount} image${imageCount > 1 ? "s" : ""} attached)_`
          : text;
      const optimistic = {
        id: `optimistic-${Date.now()}`,
        role: "user" as const,
        content: storedContent,
        model: effective,
        created_at: new Date().toISOString(),
      };
      setOptimisticUserMessage(optimistic);
      qc.setQueryData(["chat", threadId], (prev: any) => {
        if (!prev) {
          return {
            chat: { id: threadId, title: text.slice(0, 60) },
            messages: [optimistic],
          };
        }
        return { ...prev, messages: [...(prev.messages ?? []), optimistic] };
      });

      // Pre-flight: ask if this needs a web search so we can show
      // "Searching the web…" while the model spins up. Lite skips search.
      let searchQuery: string | undefined;
      if (effective !== "dap-ai-lite") {
        try {
          const plan = await planSearch({ data: { text } });
          if (plan?.query) {
            searchQuery = plan.query;
            setSearchingWeb(true);
          }
        } catch {
          /* best-effort */
        }
      }

      try {
        const sendPromise = send({
          data: {
            chatId: threadId,
            text,
            images,
            model: effective,
            searchQuery,
          },
        });
        // Fire a module-level notifier so the top-of-screen toast still
        // appears if the user navigated away from this chat before the
        // reply arrived (component onSuccess would not run in that case).
        const title = chatQuery.data?.chat?.title || text.slice(0, 60) || "New reply";
        trackAiReply(threadId, title, sendPromise);
        return await sendPromise;
      } finally {
        setSearchingWeb(false);
      }
    },
    onSuccess: (result) => {
      setOptimisticUserMessage(null);
      qc.setQueryData(["chat", threadId], (prev: any) => ({
        chat: prev?.chat ?? { id: threadId, title: "Chat" },
        messages: result.messages ?? prev?.messages ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["chat", threadId] });
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (result.forcedToLite) {
        toast.info("DAP AI 4 Pro is Pro-only — replied with DAP AI 4 Lite.");
      }
    },
    onError: (e) => {
      setSearchingWeb(false);
      setOptimisticUserMessage(null);
      // Roll back the optimistic message on failure.
      qc.invalidateQueries({ queryKey: ["chat", threadId] });
      toast.error(e instanceof Error ? e.message : "Send failed");
    },
  });


  // Auto-send any pending message stashed from the homepage navigation.
  const pendingFired = useRef(false);
  useEffect(() => {
    if (!user || pendingFired.current) return;
    if (typeof window === "undefined") return;
    const key = `dap.pending.${threadId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    pendingFired.current = true;
    sessionStorage.removeItem(key);
    try {
      const payload = JSON.parse(raw) as { text: string; images?: string[] };
      sendMut.mutate(payload);
    } catch {
      /* ignore */
    }
  }, [user, threadId, sendMut]);



  if (!user) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const messages = chatQuery.data?.messages ?? [];
  const visible = messages
    .filter((m) => m.role !== "system")
    .concat(
      optimisticUserMessage &&
        !messages.some(
          (m) =>
            m.role === "user" &&
            m.content === optimisticUserMessage.content
        )
        ? [optimisticUserMessage]
        : []
    );
  const busy = sendMut.isPending;

  // Detect an active DAP from the first system message ("[DAP: Name]\n...").
  const firstSystem = messages.find((m) => m.role === "system");
  const dapMatch = firstSystem?.content.match(/^\[DAP:\s*([^\]\n]+)\]/);
  const dapName = dapMatch?.[1]?.trim();

  return (
    <div className="chat-page-enter flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
          <h1 className="text-lg font-semibold text-foreground">
            {chatQuery.data?.chat?.title || "Chat"}
          </h1>
          {dapName && (
            <div className="flex items-center justify-center">
              <span
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)]"
                style={{ borderColor: "color-mix(in oklab, var(--primary) 35%, transparent)" }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--gradient-brand)" }}
                />
                DAP active · {dapName}
              </span>
            </div>
          )}

          {visible.map((m) => (
            <div key={m.id} className="flex gap-3 message-in">
              {m.role === "user" ? (
                <div
                  className="mt-1 h-8 w-8 shrink-0 rounded-full"
                  style={{ background: "oklch(0.85 0.04 255)" }}
                />
              ) : (
                <img
                  src={logo.url}
                  alt="DAP AI"
                  className="mt-1 h-8 w-8 shrink-0 rounded-full object-contain"
                />
              )}
              <div className="flex-1">
                <div className="text-xs font-medium text-muted-foreground">
                  {m.role === "user" ? "You" : "DAP AI"}
                </div>
                {m.role === "user" ? (
                  <div className="user-bubble mt-1 inline-block whitespace-pre-wrap">
                    {m.content}
                  </div>
                ) : (
                  <div className="mt-1 text-foreground">
                    <MarkdownMessage
                      content={m.model === "dap-ai-lite" ? sanitizeLiteReply(m.content) : m.content}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-3 message-in">
              <img
                src={logo.url}
                alt="DAP AI"
                className="mt-1 h-8 w-8 shrink-0 rounded-full object-contain"
              />
              <div className="flex-1">
                <div className="text-xs font-medium text-muted-foreground">
                  DAP AI
                </div>
                {searchingWeb ? (
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <span
                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden
                    />
                    <span>Searching the web…</span>
                  </div>
                ) : (
                  <div className="mt-2">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur">
        {!siteEnabled || maintenance ? (
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              DAP AI is undergoing major reworks
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Please try again later.
            </p>
          </div>
        ) : (
          <>
            <ChatComposer
              onSend={(text, images) => sendMut.mutate({ text, images })}
              pending={busy}
              onStop={() => {
                void stop({ data: { chatId: threadId } }).catch(() => {});
                toast.info("Stopping…");
              }}
              quotaInfo={
                profileQuery.data
                  ? { tier: profileQuery.data.tier as "free" | "pro" }
                  : undefined
              }
            />
            <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
              DAP AI is AI and can make mistakes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
