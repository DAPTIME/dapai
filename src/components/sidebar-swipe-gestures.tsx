import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Global swipe gestures for the mobile sidebar:
 * - Swipe right (from anywhere on screen) → opens sidebar
 * - Swipe left → closes sidebar
 * Triggers on horizontal swipes > 60px that dominate vertical motion.
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

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
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
      const dt = Date.now() - startT;
      if (dt > 800) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

      if (dx > 0 && !openMobile) setOpenMobile(true);
      else if (dx < 0 && openMobile) setOpenMobile(false);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isMobile, openMobile, setOpenMobile]);

  return null;
}
