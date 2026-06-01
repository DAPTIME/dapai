import { useState, useEffect, FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Send,
  Paperclip,
  Mic,
  Image as ImageIcon,
  Sparkles,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export interface QuotaInfo {
  tier: "free" | "pro";
  remainingPro?: number;
  limit?: number;
}

interface Props {
  onSend?: (text: string) => void;
  quotaInfo?: QuotaInfo;
}

const MODELS = [
  { id: "dap-ai-1.0", label: "DAP AI 3.2", requiresAccount: true },
  { id: "dap-ai-lite", label: "DAP AI Lite 3.2", requiresAccount: false },
];

export function ChatComposer({ onSend, quotaInfo }: Props) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [model, setModel] = useState<string>(
    user ? MODELS[0].id : "dap-ai-lite"
  );

  // Force Lite for free users who have exhausted quota
  const proExhausted =
    quotaInfo?.tier === "free" && (quotaInfo.remainingPro ?? 0) <= 0;

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("dap.model") : null;
    const target = saved && MODELS.some((m) => m.id === saved) ? saved : null;
    if (target) {
      const m = MODELS.find((mm) => mm.id === target)!;
      const allow = (!m.requiresAccount || user) && !(m.id === "dap-ai-1.0" && proExhausted);
      setModel(allow ? target : "dap-ai-lite");
    } else if (!user || proExhausted) {
      setModel("dap-ai-lite");
    }
  }, [user, proExhausted]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend?.(text);
    setText("");
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-3xl rounded-3xl border border-border bg-card p-2 shadow-[var(--shadow-soft)] focus-within:ring-2 focus-within:ring-ring/40 transition"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask DAP AI anything…"
        rows={2}
        className="w-full resize-none bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <Mic className="h-4 w-4" />
          </Button>
          <select
            value={model}
            onChange={(e) => {
              const next = e.target.value;
              const m = MODELS.find((mm) => mm.id === next);
              if (m?.requiresAccount && !user) return;
              if (next === "dap-ai-1.0" && proExhausted) return;
              setModel(next);
              if (typeof window !== "undefined") localStorage.setItem("dap.model", next);
            }}
            className="ml-2 rounded-md bg-transparent px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring/40"
            aria-label="Select model"
          >
            {MODELS.map((m) => {
              const locked =
                (m.requiresAccount && !user) ||
                (m.id === "dap-ai-1.0" && proExhausted);
              return (
                <option
                  key={m.id}
                  value={m.id}
                  disabled={locked}
                  className="bg-card text-foreground"
                >
                  {m.label}
                  {m.requiresAccount && !user
                    ? " — sign in required"
                    : m.id === "dap-ai-1.0" && proExhausted
                      ? " — free limit reached"
                      : ""}
                </option>
              );
            })}
          </select>
          {!user && (
            <Link
              to="/login"
              className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Lock className="h-3 w-3" />
              Sign in for full DAP AI
            </Link>
          )}
          {quotaInfo?.tier === "free" && quotaInfo.limit != null && (
            <span className="ml-2 text-xs text-muted-foreground">
              {quotaInfo.remainingPro ?? 0}/{quotaInfo.limit} DAP AI 3.2 left
            </span>
          )}
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={!text.trim()}
          className="h-9 w-9 rounded-full"
          style={text.trim() ? { background: "var(--gradient-brand)" } : undefined}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

export function SuggestionChips({ onPick }: { onPick?: (s: string) => void }) {
  const items = [
    { icon: Sparkles, label: "Brainstorm names for a side project" },
    { icon: Sparkles, label: "Plan a 5-day trip to Lisbon" },
    { icon: Sparkles, label: "Explain transformers like I'm 12" },
    { icon: Sparkles, label: "Draft a polite follow-up email" },
  ];
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => onPick?.(it.label)}
          className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left text-sm text-foreground transition hover:border-ring/40 hover:shadow-[var(--shadow-soft)]"
        >
          <span className="rounded-lg bg-accent p-2 text-accent-foreground">
            <it.icon className="h-4 w-4" />
          </span>
          <span className="pt-1.5">{it.label}</span>
        </button>
      ))}
    </div>
  );
}
