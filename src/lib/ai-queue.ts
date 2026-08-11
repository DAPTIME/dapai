/**
 * In-process FIFO queue keyed by model. Ensures only one request is in
 * flight against a given local AI backend at a time — the LM Studio /
 * Ollama box on the user's PC can only chew on one prompt per model
 * without thrashing. Each model gets its own independent queue so the
 * Pro model and the Lite model can serve users in parallel.
 *
 * Note: this is per-Worker-instance. The site runs on a small edge
 * footprint so in practice there's effectively one instance; if the
 * platform spawns more, each one still serializes its own traffic, which
 * is the important guarantee for the local GPU.
 */
type Task<T> = () => Promise<T>;

const tails = new Map<string, Promise<unknown>>();

export function enqueue<T>(key: string, task: Task<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const next = prev.then(task, task);
  // Swallow rejection on the stored tail so one failure doesn't poison
  // the chain for the next caller.
  tails.set(
    key,
    next.catch(() => {})
  );
  return next;
}

/**
 * Interrupt support. A chat can be marked "stopped" while its request is
 * queued or in flight; sendChatMessage checks the flag before dialing the
 * backend and aborts the upstream fetch, letting the next person in the
 * per-model queue go ahead.
 */
const stopped = new Map<string, number>();
const aborters = new Map<string, AbortController>();

export function markStopped(chatId: string) {
  stopped.set(chatId, Date.now());
  aborters.get(chatId)?.abort();
}

export function isStopped(chatId: string) {
  return stopped.has(chatId);
}

export function clearStopped(chatId: string) {
  stopped.delete(chatId);
}

export function registerAborter(chatId: string, ctrl: AbortController) {
  aborters.set(chatId, ctrl);
}

export function unregisterAborter(chatId: string) {
  aborters.delete(chatId);
}
