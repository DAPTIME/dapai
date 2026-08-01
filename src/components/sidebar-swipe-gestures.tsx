import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

/** How close to the left edge a swipe must start to count as "open". */
const EDGE_PX = 28;

/**
 * Swipe gestures for the mobile sidebar.
 *
 * Opening is an *edge* swipe: the touch has to start within EDGE_PX of the
 * left edge, the way iOS and Android back-gestures do. It used to trigger
 * from anywhere on screen, which meant any horizontal drag opened the
 * sidebar on top of what you were doing — steering in a game, dragging the
 * hardware turntable, swiping a carousel. Closing still works from
 * anywhere, because once the sidebar is over the page there is nothing
 * underneath to conflict with.
 *
 * A touch that starts on a <canvas> or inside [data-no-swipe] is ignored
 * outright. Games read raw touches, and some of them put their controls
 * against the left edge, which is exactly where the open gesture lives.
 */
export function SidebarSwipeGestures() {
  const { openMobile, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;

    const isGuarded = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      return !!el?.closest("canvas, [data-no-swipe]");
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      if (e.touches.length !== 1) return;
      if (isGuarded(e.target)) return;
      const t = e.touches[0];
      // Opening is edge-only; closing can begin anywhere.
      if (!openMobile && t.clientX > EDGE_PX) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Date.now() - startT > 800) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

      if (dx > 0 && !openMobile) setOpenMobile(true);
      else if (dx < 0 && openMobile) setOpenMobile(false);
    };

    const onCancel = () => { tracking = false; };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [isMobile, openMobile, setOpenMobile]);

  return null;
}
