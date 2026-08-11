import { useState, useEffect, useRef, FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Send,
  Square,
  Paperclip,
  Image as ImageIcon,
  Sparkles,
  Lock,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProfile } from "@/lib/chats.functions";
import { useUpgradeGate, TIER_LABEL } from "@/lib/tier-gate";
import { MODELS } from "@/lib/models";
import { useSiteConfig } from "@/lib/site-config";


export interface QuotaInfo {
  tier: "free" | "pro";
}

interface Props {
  onSend?: (text: string, images?: string[]) => void;
  quotaInfo?: QuotaInfo;
  pending?: boolean;
  /** Called when the user interrupts an in-flight reply. */
  onStop?: () => void;
  /** When true the bar is read-only and shows the admin's offline message. */
  offline?: boolean;
  offlineMessage?: string;
}




const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function ChatComposer({
  onSend,
  quotaInfo,
  pending,
  onStop,
  offline,
  offlineMessage,
}: Props) {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getProfile);
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user && !quotaInfo,
    staleTime: 60_000,
  });
  const { requireTier, hasTier } = useUpgradeGate();

  const siteConfig = useSiteConfig();
  const isOffline = offline || !siteConfig.enabled;
  const offlineText = offlineMessage?.trim() || siteConfig.offlineMessage;

  const flagOn = (id: string) => {
    const m = MODELS.find((mm) => mm.id === id);
    return m ? siteConfig.flags[m.flag] !== false : false;
  };
  const allowed = (id: string) => {
    const m = MODELS.find((mm) => mm.id === id);
    if (!m) return false;
    return hasTier(m.minTier) && flagOn(m.id);
  };

  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [model, setModel] = useState<string>("dap-ai-lite");

  // Keep the prompt textarea focused on mount and after each send finishes.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!pending) textareaRef.current?.focus();
  }, [pending]);

  // Resolve the best model the account is actually allowed to use.
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("dap.model") : null;
    const best =
      [...MODELS].reverse().find((m) => allowed(m.id))?.id ?? "dap-ai-lite";
    const resolved = saved && allowed(saved) ? saved : best;
    setModel(resolved);
    if (typeof window !== "undefined") {
      localStorage.setItem("dap.model", resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    profileQuery.data?.tier,
    siteConfig.flags.lite_model,
    siteConfig.flags.pro_lite_model,
    siteConfig.flags.pro_model,
  ]);

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
    if (pending) return;
    if (!text.trim() && images.length === 0) return;
    onSend?.(text.trim() || "(image)", images.length ? images : undefined);
    setText("");
    setImages([]);
  };

  const activeModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

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
        value={isOffline ? "" : text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isOffline ? offlineText : "Ask DAP AI anything…"}
        rows={2}
        disabled={isOffline}
        aria-disabled={isOffline}
        className="w-full resize-none bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            if (pending || isOffline) { e.preventDefault(); return; }
            submit(e);
          }
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
          {(() => {
            const liteSelected = activeModel.lite;
            const imgTitle = liteSelected
              ? `${activeModel.label} doesn't support images yet`
              : "Attach image";
            const onClick = () => {
              if (liteSelected) {
                toast.error(`${activeModel.label} doesn't support images yet.`);
                return;
              }
              fileInputRef.current?.click();
            };
            return (
              <>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full disabled:opacity-40" aria-label={imgTitle} title={imgTitle} disabled={liteSelected} onClick={onClick}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full disabled:opacity-40" aria-label={imgTitle} title={imgTitle} disabled={liteSelected} onClick={onClick}>
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </>
            );
          })()}
          <select
            value={model}
            onChange={(e) => {
              const next = e.target.value;
              const m = MODELS.find((mm) => mm.id === next);
              if (!m) return;
              if (!flagOn(m.id)) return;
              // Selecting a locked model pops the upgrade screen instead of
              // silently doing nothing.
              if (!hasTier(m.minTier)) {
                requireTier(m.minTier, m.label);
                return;
              }
              setModel(next);
              if (typeof window !== "undefined")
                localStorage.setItem("dap.model", next);
            }}
            className="ml-2 rounded-md bg-transparent px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring/40"
            aria-label="Select model"
            title={activeModel.description}
          >
            {MODELS.map((m) => {
              const modelOffline = !flagOn(m.id);
              const locked = !hasTier(m.minTier);
              const suffix = modelOffline
                ? " — offline for maintenance"
                : locked
                  ? !user
                    ? " — sign in required"
                    : ` — ${TIER_LABEL[m.minTier]} only`
                  : "";
              return (
                <option
                  key={m.id}
                  value={m.id}
                  disabled={modelOffline}
                  className="bg-card text-foreground"
                  title={modelOffline ? "Disabled by admin" : m.description}
                >
                  {m.label}
                  {suffix}
                </option>
              );
            })}
          </select>
          <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
            {activeModel.description}
          </span>
          {!user && (
            <Link
              to="/login"
              className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Lock className="h-3 w-3" />
              Sign in for full DAP AI
            </Link>
          )}
        </div>
        {pending && onStop ? (
          <Button
            type="button"
            size="icon"
            onClick={onStop}
            className="relative h-9 w-9 rounded-full transition-transform active:scale-95"
            style={{ background: "var(--gradient-brand)" }}
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={(!text.trim() && images.length === 0) || pending || isOffline}
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
        )}
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
  const [items, setItems] = useState(() => SUGGESTION_POOL.slice(0, 4));
  useEffect(() => {
    setItems(shuffle(SUGGESTION_POOL).slice(0, 4));
  }, []);
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
