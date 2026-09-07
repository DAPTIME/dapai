import { useEffect } from "react";
import { ADSENSE_CLIENT, adsConfigured } from "@/lib/ads";

let scriptInjected = false;

/** Injects the AdSense loader script once, client-side only. Safe on any page. */
export function AdSenseScript() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!adsConfigured() || scriptInjected) return;
    if (
      document.querySelector('script[data-adsense-loader="true"]') ||
      document.querySelector('script[src*="adsbygoogle.js"]')
    ) {
      scriptInjected = true;
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.crossOrigin = "anonymous";
    script.dataset.adsenseLoader = "true";
    document.head.appendChild(script);
    scriptInjected = true;
  }, []);

  return null;
}
