import { useState, useEffect, useRef, FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Sparkles,
  Lock,
  Loader2,
  X,
  Check,
  ChevronDown,
  Zap,
  Gauge,
  Brain,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CHAT_MODELS,
  MODEL_STORAGE_KEY,
  isModelAllowedForTier,
  modelInfo,
  resolveModelChoice,
  type ChatModelId,
} from "@/lib/models";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProfile } from "@/lib/chats.functions";
import { getFeatureFlags } from "@/lib/admin.functions";
import { getMyQuota } from "@/lib/quota.functions";
import {
  MSG_PROMPT_TOO_LONG,
  estimateTokens,
  tierConfig,
  usageCostFor,
  type Tier,
} from "@/lib/tiers";


export interface QuotaInfo {
  tier: Tier;
}

interface Props {
  onSend?: (text: string, images?: string[]) => void;
  quotaInfo?: QuotaInfo;
  pending?: boolean;
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

function ModelIcon({ id, className }: { id: string; className?: string }) {
  if (id === "dap-ai-1.0") return <Brain className={className} />;
  if (id === "dap-ai-pro-lite") return <Gauge className={className} />;
  return <Zap className={className} />;
}

export function ChatComposer({ onSend, quotaInfo, pending }: Props) {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getProfile);
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user && !quotaInfo,
  });
  const tier = (quotaInfo?.tier ??
    (profileQuery.data?.tier as Tier | undefined) ??
    "free") as Tier;
  const cfg = tierConfig(tier);
  const isPaid = tier !== "free";
  const canUsePro = !!user && isPaid;

  // Live usage-token budget (hidden for the Exclusive tier).
  const fetchQuota = useServerFn(getMyQuota);
  const quotaQuery = useQuery({
    queryKey: ["my-quota", user?.id],
    queryFn: () => fetchQuota(),
    enabled: !!user,
    staleTime: 15_000,
  });
  const quota = quotaQuery.data;

  const fetchFlags = useServerFn(getFeatureFlags);
  const flagsQuery = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => fetchFlags(),
    refetchInterval: 30_000,
  });
  const flags = flagsQuery.data;

  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [model, setModel] = useState<ChatModelId>("dap-ai-lite");

  // Per-response image cap for this tier (null = no cap; we still keep a
  // sane upload ceiling so the payload stays reasonable).
  const imageCap = cfg.maxImagesPerResponse ?? 4;

  // Keep the prompt textarea focused on mount and after each send finishes.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!pending) textareaRef.current?.focus();
  }, [pending]);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem(MODEL_STORAGE_KEY)
        : null;
    const resolved = resolveModelChoice({
      saved,
      tier,
      signedIn: !!user,
      flags,
    });
    setModel(resolved);
    if (typeof window !== "undefined") {
      localStorage.setItem(MODEL_STORAGE_KEY, resolved);
    }
  }, [tier, user, flags]);

  const handlePickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (images.length >= imageCap) {
      toast.error(
        `Your plan allows ${imageCap} image${imageCap === 1 ? "" : "s"} per response.`
      );
      return;
    }
    const next: string[] = [];
    for (const f of Array.from(files).slice(0, imageCap - images.length)) {
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
    if (next.length) setImages((prev) => [...prev, ...next].slice(0, imageCap));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!text.trim() && images.length === 0) return;
    // Reject over-long prompts before spending anything.
    if (user && usageCostFor(text.trim() || "(image)", tier) === null) {
      toast.error(MSG_PROMPT_TOO_LONG);
      return;
    }
    onSend?.(text.trim() || "(image)", images.length ? images : undefined);
    setText("");
    setImages([]);
  };

  const promptTokens = estimateTokens(text);
  const overPromptCap = promptTokens > cfg.maxPromptTokens;
  const activeModel = modelInfo(model);

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
          if (e.key === "Enter" && !e.shiftKey) {
            if (pending) { e.preventDefault(); return; }
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
            const liteSelected = !activeModel.supportsImages;
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Select model"
                className="ml-1 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-primary-foreground"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <ModelIcon id={activeModel.id} className="h-3.5 w-3.5" />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-medium text-foreground">
                    {activeModel.label}
                  </span>
                  <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                    {activeModel.description}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="top"
              sideOffset={10}
              className="w-[min(22rem,calc(100vw-2rem))] p-1.5"
            >
              <DropdownMenuLabel className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Choose a model
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CHAT_MODELS.map((m) => {
                const offline = flags?.[m.flag] === false;
                const locked = !isModelAllowedForTier(m, tier, !!user);
                const disabled = offline || locked;
                const note = offline
                  ? "Offline for maintenance"
                  : locked
                    ? !user
                      ? "Sign in to use this model"
                      : m.id === "dap-ai-1.0"
                        ? "Available on Pro"
                        : "Available on Go and above"
                    : null;
                return (
                  <DropdownMenuItem
                    key={m.id}
                    disabled={disabled}
                    onSelect={() => {
                      if (disabled) return;
                      setModel(m.id);
                      if (typeof window !== "undefined") {
                        localStorage.setItem(MODEL_STORAGE_KEY, m.id);
                      }
                    }}
                    className="flex items-start gap-3 rounded-lg px-2 py-2.5"
                  >
                    <span
                      className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                        disabled
                          ? "bg-muted text-muted-foreground"
                          : "text-primary-foreground"
                      }`}
                      style={
                        disabled ? undefined : { background: "var(--gradient-brand)" }
                      }
                    >
                      <ModelIcon id={m.id} className="h-4 w-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {m.label}
                        {model === m.id && !disabled && (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                      </span>
                      <span className="text-xs leading-snug text-muted-foreground">
                        {m.description}
                      </span>
                      {note && (
                        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {locked && !offline && <Lock className="h-3 w-3" />}
                          {note}
                        </span>
                      )}
                    </span>
                  </DropdownMenuItem>
                );
              })}
              {tier !== "exclusive" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="rounded-lg px-2 py-2 text-xs">
                    <Link to="/plans">Compare plans and unlock more models</Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {user && quota && !quota.unlimited && quota.dayTokensLimit !== null && (
            <Link
              to="/plans"
              title={`Daily usage tokens reset at ${quota.dailyResetsAt}`}
              className="ml-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {Math.max(
                0,
                quota.dayTokensLimit - quota.dayTokensUsed
              ).toLocaleString()}{" "}
              / {quota.dayTokensLimit} tokens today
            </Link>
          )}
          {user && overPromptCap && (
            <span className="ml-2 text-xs text-destructive">
              Prompt too long ({promptTokens}/{cfg.maxPromptTokens})
            </span>
          )}
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
