// Central ad configuration. Fill ADSENSE_CLIENT with "ca-pub-…" once the
// publisher account is approved; everything else reads from here so ad
// units can be wired up without touching component code.

export const ADSENSE_CLIENT = "";

export const AD_SLOTS = {
  topBanner: "",
  bottomBanner: "",
  inGameTop: "",
  inGameBottom: "",
  interstitial: "",
};

/** Minimum/maximum seconds a player must watch the pre-game ad gate. */
export const AD_GATE_MIN_SECONDS = 10;
export const AD_GATE_MAX_SECONDS = 15;

/** True once a real publisher id has been set. Until then we render placeholders. */
export function adsConfigured(): boolean {
  return ADSENSE_CLIENT.trim().length > 0;
}
