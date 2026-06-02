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
