import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ChatComposer } from "@/components/chat-composer";
import logo from "@/assets/logo.png.asset.json";
import { getChat, sendChatMessage, getProfile } from "@/lib/chats.functions";
import { useAuth } from "@/lib/auth";

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

  const sendMut = useMutation({
    mutationFn: ({ text, images }: { text: string; images?: string[] }) => {
      const model =
        (typeof window !== "undefined"
          ? localStorage.getItem("dap.model")
          : null) || "dap-ai-1.0";
      return send({
        data: {
          chatId: threadId,
          text,
          images,
          model: model === "dap-ai-lite" ? "dap-ai-lite" : "dap-ai-1.0",
        },
      });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["chat", threadId] });
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (result.forcedToLite) {
        toast.info(
          "You've used all 5 free DAP AI 3.2 messages — switched to DAP AI Lite."
        );
      }
    },
    onError: (e) => {
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
              <div
                className="mt-1 h-8 w-8 shrink-0 rounded-full"
                style={{
                  background:
                    m.role === "user"
                      ? "oklch(0.85 0.04 255)"
                      : "var(--gradient-brand)",
                }}
              />
              <div className="flex-1">
                <div className="text-xs font-medium text-muted-foreground">
                  {m.role === "user" ? "You" : "DAP AI"}
                </div>
                {m.role === "user" ? (
                  <div className="user-bubble mt-1 inline-block whitespace-pre-wrap">
                    {m.content}
                  </div>
                ) : (
                  <div className="mt-1 whitespace-pre-wrap text-foreground">
                    {m.content}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-3 message-in">
              <div
                className="mt-1 h-8 w-8 shrink-0 rounded-full"
                style={{ background: "var(--gradient-brand)" }}
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
        <ChatComposer
          onSend={(text, images) => sendMut.mutate({ text, images })}
          pending={busy}
          quotaInfo={
            profileQuery.data && profileQuery.data.tier === "free"
              ? {
                  tier: "free",
                  remainingPro: profileQuery.data.remainingPro ?? 0,
                  limit: profileQuery.data.freeProLimit,
                }
              : { tier: "pro" }
          }
        />
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
          DAP AI may produce inaccurate info.
        </p>
      </div>
    </div>
  );
}
