import { useState, useEffect, useRef, FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Send,
  Paperclip,
  Mic,
  Image as ImageIcon,
  Sparkles,
  Lock,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface QuotaInfo {
  tier: "free" | "pro";
  remainingPro?: number;
  limit?: number;
}

interface Props {
  onSend?: (text: string, images?: string[]) => void;
  quotaInfo?: QuotaInfo;
  pending?: boolean;
}

const MODELS = [
  { id: "dap-ai-1.0", label: "DAP AI 3.2", requiresAccount: true },
  { id: "dap-ai-lite", label: "DAP AI Lite 3.2", requiresAccount: false },
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function ChatComposer({ onSend, quotaInfo, pending }: Props) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [model, setModel] = useState<string>(
    user ? MODELS[0].id : "dap-ai-lite"
  );

  // Keep the prompt textarea focused on mount and after each send finishes.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!pending) textareaRef.current?.focus();
  }, [pending]);


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

  const handlePickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: string[] = [];
    for (const f of Array.from(files).slice(0, 4 - images.length)) {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} isn't an image.`);
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        toast.error(`${f.name} is over 5 MB.`);
        continue;
      }
      try {
        next.push(await readAsDataUrl(f));
      } catch {
        toast.error(`Couldn't read ${f.name}.`);
      }
    }
    if (next.length) setImages((prev) => [...prev, ...next].slice(0, 4));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() && images.length === 0) return;
    onSend?.(text.trim() || "(image)", images.length ? images : undefined);
    setText("");
    setImages([]);
  };

  return (
    <form
      onSubmit={submit}
      className={`mx-auto w-full max-w-3xl rounded-3xl border border-border bg-card p-2 shadow-[var(--shadow-soft)] focus-within:ring-2 focus-within:ring-ring/40 transition ${pending ? "composer-pending" : ""}`}
    >
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {images.map((src, i) => (
            <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
              <img src={src} alt={`Attachment ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover:bg-background"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        autoFocus

        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask DAP AI anything…"
        rows={2}
        className="w-full resize-none bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handlePickImages(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Attach file" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Attach image" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Voice input">
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
          disabled={(!text.trim() && images.length === 0) || pending}
          className={`relative h-9 w-9 overflow-hidden rounded-full transition-transform active:scale-95 ${pending ? "send-pending" : ""} ${(text.trim() || images.length) && !pending ? "send-ready" : ""}`}
          style={text.trim() || images.length || pending ? { background: "var(--gradient-brand)" } : undefined}
          aria-label={pending ? "Sending" : "Send message"}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
}

const SUGGESTION_POOL = [
  { icon: Sparkles, label: "Brainstorm names for a side project" },
  { icon: Sparkles, label: "Plan a 5-day trip to Lisbon" },
  { icon: Sparkles, label: "Explain transformers like I'm 12" },
  { icon: Sparkles, label: "Draft a polite follow-up email" },
  { icon: Sparkles, label: "Write a Python script to sort files" },
  { icon: Sparkles, label: "Help me prep for a tech interview" },
  { icon: Sparkles, label: "Summarize the concept of blockchain" },
  { icon: Sparkles, label: "Create a weekly meal prep plan" },
  { icon: Sparkles, label: "Debug my React useEffect loop" },
  { icon: Sparkles, label: "Suggest a good book on leadership" },
  { icon: Sparkles, label: "Write a haiku about AI" },
  { icon: Sparkles, label: "Compare TypeScript vs Python" },
  { icon: Sparkles, label: "Outline a pitch deck for a SaaS idea" },
  { icon: Sparkles, label: "Help me negotiate a salary raise" },
  { icon: Sparkles, label: "Build a workout plan for beginners" },
  { icon: Sparkles, label: "Explain quantum computing simply" },
  { icon: Sparkles, label: "Generate 10 social post ideas" },
  { icon: Sparkles, label: "Review my resume bullet points" },
  { icon: Sparkles, label: "Help me learn guitar chords faster" },
  { icon: Sparkles, label: "Write a bedtime story for a 5-year-old" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function SuggestionChips({ onPick }: { onPick?: (s: string) => void }) {
  const items = shuffle(SUGGESTION_POOL).slice(0, 4);
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
