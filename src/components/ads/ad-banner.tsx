import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, AD_SLOTS, adsConfigured } from "@/lib/ads";
import { useAdFree } from "@/lib/use-ad-free";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const HEIGHT_CLASS = "min-h-[90px]";

/** A responsive top/bottom banner ad, or a matching placeholder while unconfigured. */
export function AdBanner({ placement }: { placement: "top" | "bottom" }) {
  const adFree = useAdFree();
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);
  const configured = adsConfigured();
  const slot = placement === "top" ? AD_SLOTS.topBanner : AD_SLOTS.bottomBanner;

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

  if (!configured) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground ${HEIGHT_CLASS}`}
      >
        Advertisement
      </div>
    );
  }

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
