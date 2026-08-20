import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ChatComposer } from "@/components/chat-composer";
import logo from "@/assets/logo.png.asset.json";
import {
  getChat,
  stopChatMessage,
  getProfile,
  discardEmptyChat,
  truncateChatFrom,
} from "@/lib/chats.functions";
import { streamChat } from "@/lib/chat-stream";
import { ReplyingIndicator } from "@/components/replying-indicator";
import { stripCutoffMarker, wasCutOff } from "@/lib/cutoff-marker";
import { useAiQueue, describeQueue, queueUpgradeHint } from "@/lib/use-ai-queue";
import { MODELS, modelInfo, type ModelId } from "@/lib/models";
import { useSiteConfig } from "@/lib/site-config";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
import { useAuth } from "@/lib/auth";
import { sanitizeLiteReply } from "@/lib/lite-sanitize";
import { MarkdownMessage } from "@/components/markdown-message";
import { trackAiReply } from "@/lib/ai-reply-notifier";
import { Button } from "@/components/ui/button";
import { Brain, GraduationCap, PanelRight, Pencil, ShieldCheck } from "lucide-react";
import { ArtifactPanel } from "@/components/artifact-panel";
import { extractArtifacts, type Artifact } from "@/lib/artifacts";
import { useSiteOpen } from "@/lib/use-site-open";

export const Route = createFileRoute("/c/$threadId")({
  head: () => ({
    meta: [
      { title: "Your conversation — DAP AI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading, ready, session } = useAuth();
  const qc = useQueryClient();
  const fetchChat = useServerFn(getChat);
  const fetchProfile = useServerFn(getProfile);
  const stop = useServerFn(stopChatMessage);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Study Mode is remembered per chat.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setStudyMode(localStorage.getItem(`dap.study.${threadId}`) === "1");
  }, [threadId]);
  const toggleStudy = (v: boolean) => {
    setStudyMode(v);
    if (typeof window !== "undefined") {
      localStorage.setItem(`dap.study.${threadId}`, v ? "1" : "0");
    }
  };
  const abortRef = useRef<AbortController | null>(null);
  const [streamText, setStreamText] = useState<string>("");
  /* The reply we just streamed is already fully on screen. When the refetch
     replaces it with the persisted row, that row must not fade in from
     opacity:0 or the finished answer blinks out and re-reveals. Set on
     stream completion, cleared as soon as the next send starts. */
  const [skipFadeAfterStream, setSkipFadeAfterStream] = useState(false);
  const [streaming, setStreaming] = useState(false);
  /* The word under the dots while we wait for the first token. Three
     looping dots alone read as frozen after a few seconds; a word that
     changes every 3s is the signal that the request is still moving.
     Stops the moment text starts arriving — the text is the signal then. */
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<{
    id: string;
    role: "user";
    content: string;
    model: ModelId;
    created_at: string;
    memory_used: boolean;
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
  /* Admin-aware: siteConfig.enabled means "open to the public", which is
     false in admin mode even for an admin. Using it here forced the
     composer offline for the very person admin mode exists for. */
  const siteEnabled = useSiteOpen();
  const proEnabled = siteConfig.flags.pro_model;
  const liteEnabled = siteConfig.flags.lite_model;

  const tier = (profileQuery.data?.tier as Tier | undefined) ?? "free";
  // Offline only when *no* model this account may use is switched on.
  // Spelling the tiers out by hand kept getting it wrong: the pair of
  // branches this replaces judged everyone below Pro on the Lite flag
  // alone, so a Go account — which may also use Pro Lite — was told the
  // site was down whenever Lite was off. Deriving it from MODELS means a
  // new model or tier cannot reintroduce that.
  const maintenance = !MODELS.some(
    (m) => TIER_RANK[tier] >= TIER_RANK[m.minTier] && siteConfig.flags[m.flag] !== false,
  );

  const queue = useAiQueue();
  const discard = useServerFn(discardEmptyChat);

  /* Pressing stop is a decision about the answer, not about the chat, so a
     cancelled thread is kept even though it has no reply. Tracked in a ref
     rather than state because only the leaving effect reads it, and it must
     not trigger a render. */
  const wasCancelled = useRef(false);

  /* Editing a message. The UI for this shipped without the state it reads,
     so every thread threw "editingId is not defined" on render and the
     whole chat route fell to the error boundary. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const truncateFrom = useServerFn(truncateChatFrom);

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
        memory_used: false,
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

      /* Wait for a slot before dialling the orchestrator. Inference runs
         on one box, so this is what stops ten simultaneous sends becoming
         ten simultaneous generations. wait() resolves immediately when the
         lane is free, and returns false if the person gave up while
         queued — in which case nothing is sent. */
      const myTurn = await queue.wait(threadId);
      if (!myTurn) {
        setOptimisticUserMessage(null);
        throw new Error("__DAP_QUEUE_CANCELLED__");
      }

      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("You've been signed out — please sign back in.");

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setSkipFadeAfterStream(false);
      setStreamText("");

      let connectionLost = false;
      let streamError: string | null = null;

      try {
        await streamChat({
          accessToken,
          chatId: threadId,
          text,
          images,
          studyMode,
          // The picker's choice. It was resolved above for the optimistic
          // message but never sent, so the server always ran its default.
          model: effective,
          signal: controller.signal,
          onToken: (delta) => setStreamText((prev) => prev + delta),
          onDone: () => {},
          onError: (message) => {
            streamError = message;
          },
          onConnectionLost: () => {
            connectionLost = true;
          },
        });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          // Stop button — handled by the caller, not an error.
          return { stopped: true } as const;
        }
        throw err;
      } finally {
        abortRef.current = null;
        setSearchingWeb(false);
        await queue.giveUp();
      }

      if (streamError) throw new Error(streamError);
      if (connectionLost) {
        toast.error("Connection lost. Please try again.");
        return { connectionLost: true } as const;
      }
      return { done: true } as const;
    },
    onSuccess: (result: any) => {
      setOptimisticUserMessage(null);
      setStreaming(false);
      setSkipFadeAfterStream(true);
      // Whether it finished, was stopped, or lost connection, the tokens
      // already streamed stay visible via streamText until this refetch
      // brings back whatever the server actually persisted.
      if (!result?.stopped) {
        qc.invalidateQueries({ queryKey: ["chat", threadId] });
      }
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setStreamText("");
    },
    onError: (e) => {
      setSearchingWeb(false);
      setOptimisticUserMessage(null);
      setStreaming(false);
      // Roll back the optimistic message on failure.
      qc.invalidateQueries({ queryKey: ["chat", threadId] });
      // Leaving the queue is something the person just asked for, not a
      // failure to report back to them.
      if (e instanceof Error && e.message === "__DAP_QUEUE_CANCELLED__") return;
      toast.error(e instanceof Error ? e.message : "Send failed");
    },
  });


  /* Leaving a chat that never got an answer throws it away.
     A question with no reply is not a conversation, and keeping it burns
     one of the account's saved-chat slots on nothing. The server makes the
     final call — it refuses to delete anything with a live queue ticket,
     because the tab that navigated away is the one least able to know
     whether a reply is still coming. */
  useEffect(() => {
    return () => {
      discard({ data: { chatId: threadId, cancelled: wasCancelled.current } })
        .then((r) => {
          if (r?.deleted) qc.invalidateQueries({ queryKey: ["chats"] });
        })
        .catch(() => {
          /* best effort: an undeleted empty chat is untidy, not broken */
        });
    };
  }, [threadId, discard, qc]);

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

  /* Save & resend: editing rewrites history in place rather than branching.
     The edited message and everything after it are dropped server-side,
     then the new text goes out as an ordinary turn — so it queues, charges
     and streams exactly like any other message, with no second path to
     keep in step. */
  const saveEdit = async (messageId: string) => {
    const text = editText.trim();
    if (!text || busy) return;
    setEditingId(null);
    try {
      await truncateFrom({ data: { chatId: threadId, messageId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't edit that message.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["chat", threadId] });
    sendMut.mutate({ text });
  };

  // Artifacts: anything runnable/renderable DAP AI produced in this thread.
  const artifacts: Artifact[] = visible.flatMap((m) =>
    m.role === "assistant" ? extractArtifacts(m.id, m.content) : []
  );
  const showPanel = panelOpen && artifacts.length > 0;
  const openArtifact = (id: string) => {
    setArtifactId(id);
    setPanelOpen(true);
  };

  // Detect an active DAP from the first system message ("[DAP: Name]\n...").
  const firstSystem = messages.find((m) => m.role === "system");
  const dapMatch = firstSystem?.content.match(/^\[DAP:\s*([^\]\n]+)\]/);
  const dapName = dapMatch?.[1]?.trim();

  return (
    <div className="chat-page-enter flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex min-h-0 flex-1">
        <div className={`min-w-0 flex-1 overflow-y-auto ${showPanel ? "hidden md:block" : ""}`}>
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-foreground">
              {chatQuery.data?.chat?.title || "Chat"}
            </h1>
            <div className="flex items-center gap-2">
              <span
                title="Answered by DAP AI models running on our own local hardware — not a third-party AI cloud."
                className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground"
                style={{ borderColor: "color-mix(in oklab, var(--primary) 45%, transparent)" }}
              >
                <ShieldCheck className="h-3 w-3" /> Private
              </span>
              <Button
                type="button"
                size="sm"
                variant={studyMode ? "default" : "outline"}
                className="h-7 gap-1.5 rounded-full px-3 text-xs"
                aria-pressed={studyMode}
                onClick={() => toggleStudy(!studyMode)}
                {...(studyMode ? { style: { background: "var(--gradient-brand)" } } : {})}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                Study Mode
              </Button>
              {artifacts.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant={showPanel ? "default" : "outline"}
                  className="h-7 gap-1.5 rounded-full px-3 text-xs"
                  aria-pressed={showPanel}
                  onClick={() => setPanelOpen((o) => !o)}
                  {...(showPanel ? { style: { background: "var(--gradient-brand)" } } : {})}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                  Artifacts ({artifacts.length})
                </Button>
              )}
            </div>
          </div>
          {studyMode && (
            <p className="rounded-xl border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground">
              Study Mode is on — DAP AI will tutor you one step at a time and
              won't hand over the full answer up front.
            </p>
          )}
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

          {visible.map((m, mi) => (
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
                  editingId === m.id ? (
                    <div className="mt-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className="w-full rounded-2xl border border-border bg-card p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void saveEdit(m.id);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 rounded-full px-3 text-xs"
                          style={{ background: "var(--gradient-brand)" }}
                          disabled={!editText.trim() || busy}
                          onClick={() => void saveEdit(m.id)}
                        >
                          Save & resend
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-full px-3 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="group mt-1 flex items-start gap-2">
                      <div className="user-bubble inline-block whitespace-pre-wrap">
                        {m.content}
                      </div>
                      {!m.id.startsWith("optimistic-") && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label="Edit message"
                          title="Edit message"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(m.id);
                            setEditText(m.content);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )
                ) : (
                  <div className="mt-1 text-foreground">
                    <MarkdownMessage
                      content={(() => {
                        const shown = stripCutoffMarker(m.content);
                        return m.model === "dap-ai-lite" ? sanitizeLiteReply(shown) : shown;
                      })()}
                      animate={!(skipFadeAfterStream && mi === visible.length - 1)}
                    />
                    {wasCutOff(m.content) && (
                      <span className="mt-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] italic text-muted-foreground">
                        Stopped
                      </span>
                    )}
                    {extractArtifacts(m.id, m.content).length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 gap-1.5 rounded-full px-3 text-xs"
                        onClick={() => openArtifact(extractArtifacts(m.id, m.content)[0]!.id)}
                      >
                        <PanelRight className="h-3.5 w-3.5" />
                        Open in side panel
                      </Button>
                    )}
                    {m.memory_used && (
                      <span
                        title="DAP AI used facts from your Memory Vault for this reply."
                        className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <Brain className="h-3 w-3" /> Memory used
                      </span>
                    )}
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
                ) : queue.view.waiting ? (
                  /* Queued is not generating, and conflating the two makes
                     a busy site look like a slow one. Different words,
                     different motion: a pulsing dot rather than the
                     three-dot typing animation. */
                  <div
                    className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500"
                      aria-hidden
                    />
                    <span>
                      {describeQueue(queue.view)}
                      {queueUpgradeHint(tier) && (
                        <span className="ml-1 opacity-80">
                          {queueUpgradeHint(tier)}
                        </span>
                      )}
                    </span>
                  </div>
                ) : streamText ? (
                  // Tokens are already arriving — show them live, still with
                  // a small spinner so a long pause mid-answer never reads
                  // as frozen.
                  <div className="mt-1 text-foreground">
                    {/* animate={false}: the words arriving IS the
                        animation. Fading them in on a stagger that restarts
                        every token left new text invisible for over a
                        second — see useWordFader. */}
                    <MarkdownMessage content={streamText} animate={false} />
                    <span
                      className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-middle text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                ) : (
                  <ReplyingIndicator className="mt-2" active={streaming} showLogo={false} />
                )}
              </div>
            </div>
          )}
        </div>
        </div>
        {showPanel && (
          <div className="w-full md:w-[440px] md:shrink-0">
            <ArtifactPanel
              artifacts={artifacts}
              activeId={artifactId}
              onSelect={setArtifactId}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        )}
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
              queued={queue.view.waiting}
              onStop={() => {
                /* Stop means stop whichever stage we are in. Queued: leave
                   the line and hand the slot straight back rather than
                   holding it until the reaper notices. Generating: abort
                   the live SSE connection (already-streamed tokens stay on
                   screen — streamText is left alone) and release the
                   queue slot/refund server-side. */
                wasCancelled.current = true;
                if (queue.view.waiting) {
                  void queue.giveUp(true);
                  toast.info("Left the queue");
                  return;
                }
                abortRef.current?.abort();
                /* Hand back what was streamed so far. stopChatMessage only
                   stores a partial reply if it is given one, and this call
                   was not sending it — so stopping a reply threw the whole
                   answer away, which is exactly what it looked like from
                   the outside. */
                void stop({
                  data: { chatId: threadId, partialText: streamText },
                }).catch(() => {});
                toast.info("Stopped");
              }}
              quotaInfo={
                profileQuery.data
                  ? { tier: profileQuery.data.tier as Tier }
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
