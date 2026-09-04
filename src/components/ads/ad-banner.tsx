import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, AD_SLOTS, slotConfigured } from "@/lib/ads";
import { useAdFree } from "@/lib/use-ad-free";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const HEIGHT_CLASS = "min-h-[90px]";

/** A responsive top/bottom banner ad. Nothing is reserved until a real slot exists. */
export function AdBanner({ placement }: { placement: "top" | "bottom" }) {
  const adFree = useAdFree();
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);
  const slot = placement === "top" ? AD_SLOTS.topBanner : AD_SLOTS.bottomBanner;
  const configured = slotConfigured(slot);

  useEffect(() => {
    if (!configured || pushed.current || adFree) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded yet or blocked — never let this crash the page.
    }
  }, [configured, adFree]);

  if (adFree) return null;

  if (!configured) return null;

  return (
    <div className={`w-full overflow-hidden ${HEIGHT_CLASS}`}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
