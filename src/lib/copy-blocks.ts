/**
 * Streaming-safe parser for DAP AI's "copy block" markers.
 *
 * The assistant emits literal marker lines instead of markdown ``` fences:
 *
 *   copy_block_start_dap_ai
 *   <content>
 *   copy_block_end_dap_ai
 *
 * This module turns raw assistant text (partial or complete) into an
 * ordered list of segments — prose and blocks — that a renderer can turn
 * into React nodes. It is a pure function re-run on the full accumulated
 * text on every render, which keeps it correct while streaming: there is
 * no persistent state to get out of sync as more tokens arrive.
 *
 * Marker text must NEVER be visible, not even for a single frame. Two
 * cases make that tricky mid-stream:
 *  - a start/end marker can arrive split across several token chunks, so
 *    the tail of the buffered text may be a partial marker (e.g.
 *    "copy_block_st") that hasn't fully arrived yet — that partial text is
 *    held back rather than rendered as prose/content.
 *  - a stream can end entirely inside a block (no closing marker) — the
 *    block is simply left open ("closed: false") so the caller can render
 *    it gracefully instead of dumping raw marker text.
 */

export const COPY_BLOCK_START = "copy_block_start_dap_ai";
export const COPY_BLOCK_END = "copy_block_end_dap_ai";

export type CopyBlockSegment =
  | { type: "text"; content: string }
  | { type: "block"; content: string; closed: boolean };

/**
 * Length of the longest suffix of `str` that is also a strict prefix of
 * `marker` (i.e. a marker that might still be arriving). Returns 0 if
 * there is no such overlap, or if `str` already contains the full marker
 * (that case is handled by the caller via indexOf).
 */
function partialMarkerTailLength(str: string, marker: string): number {
  const maxLen = Math.min(str.length, marker.length - 1);
  for (let len = maxLen; len > 0; len--) {
    if (str.endsWith(marker.slice(0, len))) return len;
  }
  return 0;
}

/** Drop a single trailing newline (\n or \r\n), if present. */
function stripTrailingNewline(s: string): string {
  if (s.endsWith("\r\n")) return s.slice(0, -2);
  if (s.endsWith("\n")) return s.slice(0, -1);
  return s;
}

/** Skip a single leading newline (\n or \r\n) right after a marker line. */
function skipLeadingNewline(text: string, idx: number): number {
  if (text[idx] === "\r" && text[idx + 1] === "\n") return idx + 2;
  if (text[idx] === "\n") return idx + 1;
  return idx;
}

export function parseCopyBlocks(text: string): CopyBlockSegment[] {
  const segments: CopyBlockSegment[] = [];
  let i = 0;

  while (i < text.length) {
    const startIdx = text.indexOf(COPY_BLOCK_START, i);

    if (startIdx === -1) {
      // No (complete) start marker ahead. Hold back a trailing partial
      // marker so it never flashes on screen, and emit the rest as prose.
      const tail = text.slice(i);
      const partialLen = partialMarkerTailLength(tail, COPY_BLOCK_START);
      const safe = partialLen > 0 ? tail.slice(0, tail.length - partialLen) : tail;
      if (safe) segments.push({ type: "text", content: safe });
      break;
    }

    if (startIdx > i) {
      segments.push({ type: "text", content: text.slice(i, startIdx) });
    }

    const contentStart = skipLeadingNewline(text, startIdx + COPY_BLOCK_START.length);
    const endIdx = text.indexOf(COPY_BLOCK_END, contentStart);

    if (endIdx === -1) {
      // Block still open — either still streaming, or the stream ended
      // without a closing marker. Either way, render what we have.
      let body = text.slice(contentStart);
      const partialLen = partialMarkerTailLength(body, COPY_BLOCK_END);
      if (partialLen > 0) body = body.slice(0, body.length - partialLen);
      segments.push({ type: "block", content: body, closed: false });
      i = text.length;
      break;
    }

    const rawBody = stripTrailingNewline(text.slice(contentStart, endIdx));
    segments.push({ type: "block", content: rawBody, closed: true });
    i = skipLeadingNewline(text, endIdx + COPY_BLOCK_END.length);
  }

  return segments;
}
