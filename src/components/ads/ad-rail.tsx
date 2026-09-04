import { ADSENSE_CLIENT, AD_SLOTS, slotConfigured } from "@/lib/ads";
import { useAdFree } from "@/lib/use-ad-free";

/**
 * Two slim fixed ad bars for in-game placements.
 *
 * IMPORTANT: these use `position: fixed`, which is normally relative to the
 * viewport — except when an ancestor is the fullscreen element, in which
 * case a fixed descendant is repositioned relative to *that* element. So
 * for the rails to stay visible while a game canvas is fullscreened, this
 * component must be rendered *inside* the same DOM subtree that gets
 * fullscreened (e.g. inside the game's fullscreen container), not mounted
 * at the document root.
 */
export function AdRail({ className = "" }: { className?: string }) {
  const adFree = useAdFree();
  if (adFree) return null;

  const topOn = slotConfigured(AD_SLOTS.inGameTop);
  const bottomOn = slotConfigured(AD_SLOTS.inGameBottom);

  // Empty fixed rails covered the game and looked like broken ads. They only
  // belong in the player once at least one real AdSense slot can render.
  if (!topOn && !bottomOn) return null;

  return (
    <div className={className}>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex h-[50px] items-center justify-center border-b border-border bg-background/95 backdrop-blur"
      >
        <div className="pointer-events-auto h-full w-full max-w-full overflow-hidden">
          {topOn && (
            <ins
              className="adsbygoogle block h-full w-full"
              style={{ display: "block" }}
              data-ad-client={ADSENSE_CLIENT}
              data-ad-slot={AD_SLOTS.inGameTop}
              data-ad-format="horizontal"
              data-full-width-responsive="true"
            />
          )}
        </div>
      </div>

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex h-[60px] items-center justify-center border-t border-border bg-background/95 backdrop-blur"
      >
        <div className="pointer-events-auto h-full w-full max-w-full overflow-hidden">
          {bottomOn && (
            <ins
              className="adsbygoogle block h-full w-full"
              style={{ display: "block" }}
              data-ad-client={ADSENSE_CLIENT}
              data-ad-slot={AD_SLOTS.inGameBottom}
              data-ad-format="horizontal"
              data-full-width-responsive="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}
