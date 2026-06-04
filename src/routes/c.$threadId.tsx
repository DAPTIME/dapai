import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ChatComposer } from "@/components/chat-composer";
import logo from "@/assets/logo.png.asset.json";
import { getChat, sendChatMessage, getProfile, planSearchForMessage } from "@/lib/chats.functions";
import { getSiteStatus } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth";
import { sanitizeLiteReply } from "@/lib/lite-sanitize";
import { MarkdownMessage } from "@/components/markdown-message";

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
  const planSearch = useServerFn(planSearchForMessage);
  const [searchingWeb, setSearchingWeb] = useState(false);

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
  const fetchSiteStatus = useServerFn(getSiteStatus);
  const siteStatus = useQuery({
    queryKey: ["site-status"],
    queryFn: () => fetchSiteStatus(),
    refetchInterval: 30_000,
  });
  const siteEnabled = siteStatus.data?.enabled !== false;

  const sendMut = useMutation({
    mutationFn: async ({ text, images }: { text: string; images?: string[] }) => {
      const model =
        (typeof window !== "undefined"
          ? localStorage.getItem("dap.model")
          : null) || "dap-ai-1.0";
      const effective = model === "dap-ai-lite" ? "dap-ai-lite" : "dap-ai-1.0";

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
        return await send({
          data: {
            chatId: threadId,
            text,
            images,
            model: effective,
            searchQuery,
          },
        });
      } finally {
        setSearchingWeb(false);
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["chat", threadId] });
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (result.forcedToLite) {
        toast.info("DAP AI 3.2 is Pro-only — replied with DAP AI Lite.");
      }
    },
    onError: (e) => {
      setSearchingWeb(false);
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
  const visible = messages.filter((m) => m.role !== "system");
  const busy = sendMut.isPending;

  // Detect an active DAP from the first system message ("[DAP: Name]\n...").
  const firstSystem = messages.find((m) => m.role === "system");
  const dapMatch = firstSystem?.content.match(/^\[DAP:\s*([^\]\n]+)\]/);
  const dapName = dapMatch?.[1]?.trim();

  return (
    <div className="chat-page-enter flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
          <h1 className="sr-only">
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
                <div className="mt-2">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur">
        {!siteEnabled ? (
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
              quotaInfo={
                profileQuery.data
                  ? { tier: profileQuery.data.tier as "free" | "pro" }
                  : undefined
              }
            />
            <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
              DAP AI may produce inaccurate info.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
