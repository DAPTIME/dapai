import { useState, FormEvent } from "react";
import { Send, Paperclip, Mic, Image as ImageIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onSend?: (text: string) => void;
}

export function ChatComposer({ onSend }: Props) {
  const [text, setText] = useState("");

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
          <span className="ml-2 hidden text-xs sm:inline">Lumen 1.0 · preview</span>
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
