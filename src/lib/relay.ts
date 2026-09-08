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
// Version these keys whenever relay detection changes so a bad result from an
// older release cannot keep every game on the fallback path indefinitely.
/** Manual override: "on" forces the relay, "off" forces direct. */
const OVERRIDE_KEY = "dap-relay-mode-v2";

function toRelay(url: string, prefix: string): string {
  if (!url || url.startsWith(prefix)) return url;
  try {
    const u = new URL(url);
    const scheme = u.protocol.replace(":", "");
    return `${prefix}/${scheme}/${u.host}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/** Rewrite a provider asset URL so it is fetched through our own origin. */
export function relayed(url: string): string {
  return toRelay(url, PREFIX);
}

/**
 * Relay URL for a playable game frame. The provider's player reads the game
 * name from the first path segment, so the slug leads the path here.
 */
export function relayedFrame(url: string, slug: string): string {
  const clean = (slug || "game").replace(/[^a-zA-Z0-9._-]/g, "-");
  return toRelay(url, `/${clean}/px`);
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
  } catch {
    /* storage unavailable — the in-memory state below still applies */
  }
}

/**
 * Provider URLs use the same-origin relay by default. A reachability probe is
 * not reliable on filtered networks: image hosts, the player, and game builds
 * can be blocked independently. A saved explicit "off" choice is the only
 * reason to use provider URLs directly.
 */
export function useRelay(): boolean {
  const [on, setOn] = useState(true);

  useEffect(() => {
    const override = readOverride();
    setOn(override !== "off");
  }, []);

  return on;
}
