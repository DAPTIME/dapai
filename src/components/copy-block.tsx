import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Renders one copy block (the content between copy_block_start_dap_ai /
 * copy_block_end_dap_ai markers). Content may be code, shell, config, or
 * maths — it is rendered as plain preformatted monospace text rather than
 * assuming/forcing a language, and it always soft-wraps so it can never
 * cause horizontal scrolling or clip text on mobile.
 */
export function CopyBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Fallback for browsers/contexts without Clipboard API access.
      const ta = document.createElement("textarea");
      ta.value = content;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* best effort */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-end border-b border-border/70 px-2 py-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onCopy}
          aria-label="Copy"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>
      <pre className="m-0 max-w-full overflow-x-hidden whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-relaxed text-foreground">
        {content}
      </pre>
    </div>
  );
}
