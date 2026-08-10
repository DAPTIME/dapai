import { useEffect, useState } from "react";

/**
 * Should this screen get on-screen controls as well as the keyboard?
 *
 * The ask was "smaller than 13 inches". A browser cannot actually be told
 * how big a display is: there is no physical-size API, and the pixel
 * counts it does expose say nothing about density on their own. A 13"
 * laptop running 1920x1080 unscaled reports *more* pixels than a 16"
 * MacBook, so a pixel count alone gets the answer exactly backwards on
 * the machines this rule is aimed at.
 *
 * So the diagonal below is an estimate, not a measurement. It assumes the
 * CSS reference of 96px to the inch, which holds on phones, tablets and
 * HiDPI laptops at their default scaling — the common cases — and drifts
 * high on an unscaled Windows display. It is therefore one signal of
 * three rather than the whole test, and the other two catch what it
 * misses:
 *
 *   - a touch-capable device, which needs the pad whatever its size;
 *   - a narrow viewport, which is the case the old `sm:hidden` rule
 *     already handled and which stays handled.
 *
 * Erring towards showing the pad is deliberate. An unnecessary pad is
 * clutter; a missing one on a touch device means the game cannot be
 * played at all.
 */

/** CSS reference density: 96 CSS pixels to the inch. */
const CSS_PPI = 96;

/**
 * Threshold on the *estimate* above, not on true inches — the estimate
 * runs high, so calibrating it to a literal 13 would catch nothing.
 * Measured against real device profiles:
 *
 *     Pixel 7 ................ 10.5
 *     iPad Pro 11 ............ 15.2
 *     13" laptop @1280x800 ... 15.7
 *     13-14" @1440x900 ....... 17.7
 *     15.6" @1920x1080 ....... 22.9
 *
 * 18 sits above every 13-14" reading and below the 15.6" one, which is
 * where the line was asked for. A 13" panel driven at 1920x1080 with no
 * scaling still reads 22.9 and will be missed; nothing in the platform
 * can tell that display apart from a 15.6" one, so it is left to the
 * touch and viewport signals.
 */
const COMPACT_INCHES = 18;

/** At or below this CSS width, offer the pad regardless of the estimate. */
const NARROW_PX = 900;

/** Estimated physical diagonal in inches. Approximate by nature — see above. */
export function estimateDiagonalInches(): number {
  if (typeof window === "undefined") return Number.POSITIVE_INFINITY;
  const s = window.screen;
  const w = s?.width ?? window.innerWidth;
  const h = s?.height ?? window.innerHeight;
  if (!w || !h) return Number.POSITIVE_INFINITY;
  return Math.hypot(w, h) / CSS_PPI;
}

/** True when the device can be touched at all. */
export function isTouchCapable(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (navigator.maxTouchPoints ?? 0) > 0 ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

/** True when touch is the only pointer — i.e. there is no keyboard. */
export function isTouchOnly(): boolean {
  if (typeof window === "undefined") return false;
  return isTouchCapable() && !window.matchMedia("(pointer: fine)").matches;
}

export function shouldShowTouchControls(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isTouchCapable() ||
    window.innerWidth <= NARROW_PX ||
    estimateDiagonalInches() <= COMPACT_INCHES
  );
}

/**
 * Reactive form. Starts false so the server-rendered markup and the first
 * client paint agree, then corrects on mount — the pad is below the
 * canvas, so it appearing a frame later shifts nothing above it.
 */
export function useCompactScreen(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const sync = () => setCompact(shouldShowTouchControls());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const mq = window.matchMedia("(pointer: coarse)");
    mq.addEventListener("change", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      mq.removeEventListener("change", sync);
    };
  }, []);

  return compact;
}
