// Central ad configuration.
//
// Values come from build-time env vars so the publisher id and slot ids can be
// rotated without touching component code. Set these in the project env:
//   VITE_ADSENSE_CLIENT      = "ca-pub-XXXXXXXXXXXXXXXX"
//   VITE_AD_SLOT_TOP         = "1234567890"
//   VITE_AD_SLOT_BOTTOM      = "1234567890"
//   VITE_AD_SLOT_INGAME_TOP  = "1234567890"
//   VITE_AD_SLOT_INGAME_BOT  = "1234567890"
//   VITE_AD_SLOT_INTERSTITIAL= "1234567890"
// Until a publisher id is present every unit renders a neutral placeholder.

const env = import.meta.env as Record<string, string | undefined>;

function val(name: string, fallback = ""): string {
  return (env[name] ?? fallback).trim();
}

export const ADSENSE_CLIENT = val("VITE_ADSENSE_CLIENT");

export const AD_SLOTS = {
  topBanner: val("VITE_AD_SLOT_TOP"),
  bottomBanner: val("VITE_AD_SLOT_BOTTOM"),
  inGameTop: val("VITE_AD_SLOT_INGAME_TOP"),
  inGameBottom: val("VITE_AD_SLOT_INGAME_BOT"),
  interstitial: val("VITE_AD_SLOT_INTERSTITIAL"),
};

/** Minimum/maximum seconds a player must watch the pre-game ad gate. */
export const AD_GATE_MIN_SECONDS = 10;
export const AD_GATE_MAX_SECONDS = 15;

/** True once a real publisher id has been set. Until then we render placeholders. */
export function adsConfigured(): boolean {
  return ADSENSE_CLIENT.startsWith("ca-pub-");
}

/** A unit only renders a real <ins> when both the client and its slot exist. */
export function slotConfigured(slot: string): boolean {
  return adsConfigured() && slot.length > 0;
}
