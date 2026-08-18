import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { parseCopyBlocks } from "@/lib/copy-blocks";
import { CopyBlock } from "@/components/copy-block";

// Wraps every word in the rendered tree with a span that fades in with
// a tiny staggered delay. Reset the counter per render so each new
// message starts its animation from the first word.
function useWordFader() {
  const counter = { i: 0 };
  const MAX_DELAY_MS = 1200;
  const STEP_MS = 18;

  const wrap = (node: React.ReactNode, keyPrefix = "w"): React.ReactNode => {
    if (node == null || typeof node === "boolean") return node;
    if (typeof node === "number") return wrap(String(node), keyPrefix);
    if (typeof node === "string") {
      const parts = node.split(/(\s+)/);
      return parts.map((part, idx) => {
        if (!part) return null;
        if (/^\s+$/.test(part)) return part;
        const delay = Math.min(counter.i * STEP_MS, MAX_DELAY_MS);
        counter.i += 1;
        return (
          <span
            key={`${keyPrefix}-${idx}`}
            className="word-fade"
            style={{ animationDelay: `${delay}ms` }}
          >
            {part}
          </span>
        );
      });
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) => (
        <React.Fragment key={`${keyPrefix}-${idx}`}>{wrap(child, `${keyPrefix}-${idx}`)}</React.Fragment>
      ));
    }
    return node;
  };
  return wrap;
}

function MarkdownProse({ content }: { content: string }) {
  const wrap = useWordFader();
  return (
    <div className="markdown-body max-w-none break-words text-foreground text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 text-2xl font-semibold tracking-tight">{wrap(children)}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-xl font-semibold tracking-tight">{wrap(children)}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-lg font-semibold">{wrap(children)}</h3>
          ),
          p: ({ children }) => <p className="my-2 leading-relaxed">{wrap(children)}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{wrap(children)}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{wrap(children)}</strong>,
          em: ({ children }) => <em className="italic">{wrap(children)}</em>,
          hr: () => <hr className="my-4 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground italic">
              {wrap(children)}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className || "");
            if (isBlock) {
              return (
                <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-sm">
                  <code className={className} {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]" {...props}>
                {children}
              </code>
            );
          },
          a: ({ children, ...props }) => (
            <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props}>
              {wrap(children)}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
          th: ({ children, style }) => (
            <th style={style} className="px-3 py-2 text-left font-semibold">{wrap(children)}</th>
          ),
          td: ({ children, style }) => (
            <td style={style} className="px-3 py-2 align-top">{wrap(children)}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Assistant messages use literal copy_block_start_dap_ai / _end_dap_ai
 * markers instead of markdown ``` fences. Split the raw text into prose
 * and block segments first (streaming-safe — see src/lib/copy-blocks.ts),
 * then render prose through the normal markdown pipeline and blocks
 * through <CopyBlock>, which never assumes/forces syntax highlighting.
 */
export function MarkdownMessage({ content }: { content: string }) {
  const segments = parseCopyBlocks(content);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "block" ? (
          <CopyBlock key={i} content={seg.content} />
        ) : seg.content ? (
          <MarkdownProse key={i} content={seg.content} />
        ) : null
      )}
    </>
  );
}
