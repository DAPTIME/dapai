// Module-level pub/sub so AI replies still notify listeners even if the
// chat page component unmounted (user navigated away mid-request).
export type AiReplyEvent = {
  chatId: string;
  title: string;
  preview: string;
};

type Listener = (e: AiReplyEvent) => void;
const listeners = new Set<Listener>();

export function onAiReply(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function trackAiReply<T extends { messages?: Array<{ role: string; content: string }> }>(
  chatId: string,
  title: string,
  promise: Promise<T>
): Promise<T> {
  try {
    const res = await promise;
    const msgs = res?.messages ?? [];
    const last = [...msgs].reverse().find((m) => m.role === "assistant");
    const preview =
      typeof last?.content === "string"
        ? last.content.replace(/\s+/g, " ").slice(0, 120)
        : "";
    listeners.forEach((l) => l({ chatId, title, preview }));
    return res;
  } catch (err) {
    throw err;
  }
}
