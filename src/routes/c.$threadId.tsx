import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

import { ChatComposer } from "@/components/chat-composer";
import { loadConfig } from "@/lib/ai-config";
import {
  appendMessage,
  getThread,
  type ChatMessage,
  type Thread,
} from "@/lib/chats";

export const Route = createFileRoute("/c/$threadId")({
  head: () => ({ meta: [{ title: "Chat — DAP AI" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const [thread, setThread] = useState<Thread | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    const t = getThread(threadId);
    if (!t) {
      navigate({ to: "/" });
      return;
    }
    setThread({ ...t });
  }, [threadId, navigate]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("dap:threads-changed", handler);
    return () => window.removeEventListener("dap:threads-changed", handler);
  }, [refresh]);

  const handleSend = async (text: string) => {
    const cfg = loadConfig();
    const userMsg: ChatMessage = { id: Date.now(), role: "user", text };
    appendMessage(threadId, userMsg);
    refresh();

    const useDirect = cfg.enabled && cfg.endpoint;
    const endpoint = useDirect ? cfg.endpoint : "/api/chat";
    const model = cfg.model || "llama3";

    const current = getThread(threadId);
    const history = (current?.messages ?? []).map((m) => ({
      role: m.role,
      content: m.text,
    }));
    const messages = cfg.systemPrompt?.trim()
      ? [{ role: "system", content: cfg.systemPrompt }, ...history]
      : history;

    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(useDirect && cfg.apiKey
            ? { Authorization: `Bearer ${cfg.apiKey}` }
            : {}),
        },
        body: JSON.stringify({ model, messages, stream: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const reply =
        data?.choices?.[0]?.message?.content ??
        data?.message?.content ??
        "(empty response)";
      appendMessage(threadId, {
        id: Date.now() + 1,
        role: "assistant",
        text: reply,
      });
      refresh();
    } catch (e) {
      toast.error("Couldn't reach your AI backend. Check Admin.");
      appendMessage(threadId, {
        id: Date.now() + 2,
        role: "assistant",
        text:
          "No AI backend reachable. Open Admin → set AI_BACKEND_URL to your PC's tunnel running LM Studio or Ollama.",
      });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const visible = (thread?.messages ?? []).filter((m) => m.role !== "system");

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
          {visible.map((m) => (
            <div key={m.id} className="flex gap-3">
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
                <div className="mt-1 whitespace-pre-wrap text-foreground">
                  {m.text}
                </div>
              </div>
            </div>
          ))}
          {busy && (
            <div className="text-sm text-muted-foreground">Thinking…</div>
          )}
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
