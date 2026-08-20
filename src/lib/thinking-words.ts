/**
 * Rotating "we're working on it" copy for the wait before the first token.
 *
 * A single fixed word sitting under three bouncing dots reads as frozen after
 * a few seconds — the dots loop, so they carry no information about time
 * passing. Changing the word every few seconds is the cheapest honest signal
 * that the request is still moving.
 *
 * The words say nothing about what the backend is actually doing, and that is
 * deliberate: the pipeline's own vocabulary (routing, refining, expert n of m)
 * used to be shown verbatim and told the reader nothing they could act on.
 */

import { useEffect, useRef, useState } from "react";

export const THINKING_WORDS = [
  "Thinking",
  "Querying",
  "Sifting",
  "Cooking",
  "Pondering",
  "Brewing",
  "Percolating",
  "Ruminating",
  "Puzzling",
  "Distilling",
  "Untangling",
  "Deciphering",
  "Formulating",
  "Mulling",
  "Crunching",
  "Weaving",
  "Assembling",
  "Considering",
  "Deliberating",
  "Noodling",
  "Reasoning",
  "Composing",
  "Wrangling",
  "Scheming",
  "Connecting",
  "Digesting",
  "Marinating",
  "Unpacking",
  "Working",
  "Simmering",
] as const;

/** Fisher-Yates on a copy — the input array is a frozen constant. */
function shuffled(words: readonly string[]): string[] {
  const out = words.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Returns a word that changes every `intervalMs` while `active` — eight
 * seconds by default, which is long enough to read one and notice the next.
 *
 * Draws from a shuffled bag rather than picking at random each tick, so the
 * whole list is seen before any word repeats, and the bag is re-cut so its
 * first draw is never the word already on screen (which would look like the
 * rotation had stalled).
 *
 * The initial value is fixed rather than random: this hook is called from a
 * component that server-renders, and a random first word would differ between
 * the server's HTML and the client's first render.
 */
export function useThinkingWord(active: boolean, intervalMs = 8000): string {
  const [word, setWord] = useState<string>(THINKING_WORDS[0]);
  const bag = useRef<string[]>([]);
  const current = useRef<string>(THINKING_WORDS[0]);

  useEffect(() => {
    if (!active) return;

    const draw = () => {
      if (bag.current.length === 0) {
        bag.current = shuffled(THINKING_WORDS);
        // Re-cut if the next draw would repeat what's already showing.
        if (bag.current[bag.current.length - 1] === current.current) {
          bag.current.unshift(bag.current.pop() as string);
        }
      }
      const next = bag.current.pop() as string;
      current.current = next;
      setWord(next);
    };

    bag.current = [];
    draw(); // first word straight away, not after a pause
    const id = setInterval(draw, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return word;
}
