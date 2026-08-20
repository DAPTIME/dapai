/**
 * "DAP AI is working on it" — the logo, the bouncing dots and a word that
 * changes every eight seconds.
 *
 * Shared so a one-to-one chat and a Study Room say the same thing the same
 * way. They had drifted: the chat had rotating words and no logo, a room
 * had a fixed line of grey text and neither.
 */
import logo from "@/assets/logo.png.asset.json";
import { useThinkingWord } from "@/lib/thinking-words";

export function ReplyingIndicator({
  active = true,
  showLogo = true,
  className = "",
}: {
  /** Pass false to freeze the rotation when nothing is pending. */
  active?: boolean;
  /**
   * Whether to draw the mark.
   *
   * A one-to-one chat already shows the DAP AI avatar beside the message
   * this sits inside, so drawing it here too gave the same logo twice in a
   * row. A Study Room has no avatar column, so there it is the only thing
   * identifying who is thinking.
   */
  showLogo?: boolean;
  className?: string;
}) {
  const word = useThinkingWord(active);

  return (
    <div
      className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
    >
      {showLogo && (
        <img
          src={logo.url}
          alt=""
          className="h-6 w-6 shrink-0 rounded-full object-contain"
          aria-hidden
        />
      )}
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      {/* Hidden from assistive tech: this is a live region, and announcing a
          fresh synonym every few seconds is noise. The stable line below is
          what a screen reader hears, once. */}
      <span key={word} className="thinking-word" aria-hidden>
        {word}...
      </span>
      <span className="sr-only">DAP AI is working on your reply</span>
    </div>
  );
}
