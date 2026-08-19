/**
 * Client for the streaming /api/chat SSE endpoint.
 *
 * POST /api/chat, Authorization: Bearer <supabase access token>,
 * body {chatId, text, images?, studyMode?}. Response is text/event-stream,
 * frames are `data: <json>\n\n` with shapes:
 *   {type:"status", stage:"routing"|"refining"|"expert"|"stitching", n?, of?}
 *   {type:"token", text}
 *   {type:"done"}
 *   {type:"error", message}
 *
 * This module owns only the parsing/dispatch — callers decide what to do
 * with each event (update UI state, persist, etc).
 */

export type ChatStreamStage = "routing" | "refining" | "expert" | "stitching";

export interface ChatStreamFrame {
  type: "status" | "token" | "done" | "error";
  stage?: ChatStreamStage;
  n?: number;
  of?: number;
  text?: string;
  message?: string;
}

/**
 * Human-facing copy for each stage.
 *
 * The stage names are the backend's own pipeline vocabulary — routing,
 * refining, expert n of m, stitching. Showing that verbatim narrated our
 * internals to the reader and changed wording several times mid-answer for
 * no benefit to them. Once a request is on its way there are only two
 * things a person needs to know: it was sent, and the reply is coming.
 *
 * The n/of fields are still accepted so the frame shape is unchanged; they
 * are simply not shown.
 */
export function describeStage(frame: { stage?: ChatStreamStage; n?: number; of?: number }): string {
  switch (frame.stage) {
    case "refining":
      return "Sending request...";
    case "expert":
    case "stitching":
      return "AI is replying...";
    case "routing":
    default:
      return "Thinking...";
  }
}

export interface StreamChatOptions {
  accessToken: string;
  chatId: string;
  text: string;
  images?: string[];
  studyMode?: boolean;
  signal?: AbortSignal;
  onStage?: (frame: ChatStreamFrame) => void;
  onToken?: (text: string) => void;
  /** Stream ended with an explicit {type:"done"} frame. */
  onDone?: () => void;
  /** Stream ended with an explicit {type:"error"} frame. */
  onError?: (message: string) => void;
  /** Stream ended (connection closed) without ever seeing "done" or "error". */
  onConnectionLost?: () => void;
}

/**
 * Runs the SSE request to completion (or until aborted). Resolves once the
 * stream has ended one way or another — never throws for a normal
 * end-of-stream condition, only for network-level failures that prevented
 * the request from starting, or for AbortError (caller already knows: it
 * asked for that).
 */
export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const { accessToken, chatId, text, images, studyMode, signal } = opts;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chatId, text, images, studyMode }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch {
      /* body wasn't JSON — keep the generic message */
    }
    opts.onError?.(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawTerminal = false;

  const handleFrame = (raw: string) => {
    const dataLines = raw
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    if (!payload || payload === "[DONE]") return;
    let frame: ChatStreamFrame;
    try {
      frame = JSON.parse(payload);
    } catch {
      return;
    }
    switch (frame.type) {
      case "status":
        opts.onStage?.(frame);
        break;
      case "token":
        if (frame.text) opts.onToken?.(frame.text);
        break;
      case "done":
        sawTerminal = true;
        opts.onDone?.();
        break;
      case "error":
        sawTerminal = true;
        opts.onError?.(frame.message || "Something went wrong.");
        break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const evt of events) {
        if (evt.trim()) handleFrame(evt);
      }
    }
    // Flush anything left in the buffer (a server that closes right after
    // its last frame, without a trailing blank line).
    if (buffer.trim()) handleFrame(buffer);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    // A network-level break mid-stream is exactly the "connection lost"
    // case — fall through to the same handling as a clean-but-terminal-less
    // close below.
  }

  if (!sawTerminal) {
    opts.onConnectionLost?.();
  }
}
