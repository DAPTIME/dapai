/**
 * Client helpers for "unblock mode".
 *
 * Some networks (schools especially) block the game provider's domains. The
 * relay route at /api/public/px serves the very same content from our own
 * origin, so we detect the block once per session and switch every provider
 * URL over to the relay.
 */
import { useEffect, useState } from "react";

const PREFIX = "/api/public/px";
const SESSION_KEY = "dap-relay-state";
/** Manual override: "on" forces the relay, "off" forces direct. */
const OVERRIDE_KEY = "dap-relay-mode";
/** Tiny provider asset used purely as a reachability probe. */
const PROBE_URL = "https://img.gamepix.com/favicon.ico";
const PROBE_TIMEOUT_MS = 4000;

/** Rewrite a provider URL so it is fetched through our own origin. */
export function relayed(url: string): string {
  if (!url || url.startsWith(PREFIX)) return url;
  try {
    const u = new URL(url);
    const scheme = u.protocol.replace(":", "");
    return `${PREFIX}/${scheme}/${u.host}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function readOverride(): "on" | "off" | null {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

/** Force the relay on/off for this browser, or clear the choice with null. */
export function setRelayMode(mode: "on" | "off" | null) {
  try {
    if (mode) localStorage.setItem(OVERRIDE_KEY, mode);
    else localStorage.removeItem(OVERRIDE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — the in-memory state below still applies */
  }
}

function probe(): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (blocked: boolean) => {
      if (settled) return;
      settled = true;
      resolve(blocked);
    };
    const timer = setTimeout(() => done(true), PROBE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      done(false);
    };
    img.onerror = () => {
      clearTimeout(timer);
      // A filtered request fails the same way a missing file does; treating
      // both as "blocked" is safe because the relay serves identical content.
      done(true);
    };
    img.referrerPolicy = "no-referrer";
    img.src = `${PROBE_URL}?p=${Date.now()}`;
  });
}

/**
 * True when provider URLs should go through the relay. Starts false (direct)
 * and flips to true if the probe fails, so nothing is delayed while checking.
 */
export function useRelay(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const override = readOverride();
    if (override) {
      setOn(override === "on");
      return;
    }
    let cached: string | null = null;
    try {
      cached = sessionStorage.getItem(SESSION_KEY);
    } catch {
      cached = null;
    }
    if (cached === "on" || cached === "off") {
      setOn(cached === "on");
      return;
    }
    let alive = true;
    void probe().then((blocked) => {
      if (!alive) return;
      try {
        sessionStorage.setItem(SESSION_KEY, blocked ? "on" : "off");
      } catch {
        /* ignore */
      }
      setOn(blocked);
    });
    return () => {
      alive = false;
    };
  }, []);

  return on;
}
