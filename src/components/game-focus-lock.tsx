import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * While a game is being played, the page around it should stay put: arrow keys,
 * space and page-up/down must drive the game instead of scrolling the page, and
 * the sidebar swipe gesture must not fire on drag-controlled games.
 *
 * The lock arms itself as soon as the player interacts with the game area and
 * releases when they click anywhere off it, so the rest of the site is one
 * click away.
 */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
  "Spacebar",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

export function GameFocusLock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const inside = el.contains(e.target as Node);
      setActive(inside);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      // preventDefault only kills the browser's scrolling — game listeners
      // still receive the event.
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  return (
    <div
      ref={ref}
      // data-no-swipe: the sidebar swipe gesture skips this subtree while the
      // player is in a game.
      {...(active ? { "data-no-swipe": "" } : {})}
      data-game-active={active ? "true" : undefined}
      className={active ? "overscroll-contain touch-pan-y" : undefined}
    >
      {children}
      {active && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Game controls are active — click anywhere outside the game to use the
          rest of the page.
        </p>
      )}
    </div>
  );
}
