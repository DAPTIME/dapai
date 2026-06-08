import { useEffect, useState } from "react";

export function useIncognito() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOn(localStorage.getItem("dap.incognito") === "1");
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key: string; value: boolean } | undefined;
      if (detail?.key === "dap.incognito") setOn(!!detail.value);
    };
    window.addEventListener("dap.setting", handler);
    return () => window.removeEventListener("dap.setting", handler);
  }, []);
  return on;
}

export function isIncognitoNow(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("dap.incognito") === "1";
}
