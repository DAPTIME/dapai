import { useEffect, useRef, useState } from "react";
import { ADSENSE_CLIENT, AD_SLOTS, AD_GATE_MAX_SECONDS, AD_GATE_MIN_SECONDS, slotConfigured } from "@/lib/ads";
import { useAdFree } from "@/lib/use-ad-free";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AdRail } from "@/components/ads/ad-rail";

/**
 * Gates play behind a short ad. Counts down from AD_GATE_MAX_SECONDS;
 * "Skip" enables once AD_GATE_MAX_SECONDS - AD_GATE_MIN_SECONDS have
 * elapsed (i.e. AD_GATE_MIN_SECONDS watched), and it auto-continues at 0.
 */
export function AdGate({
  children,
  label,
  onDone,
}: {
  children: React.ReactNode;
  label?: string;
  /** Fired once the gate has been satisfied, so callers can auto-start play. */
  onDone?: () => void;
}) {
  const adFree = useAdFree();
  const configured = slotConfigured(AD_SLOTS.interstitial);
  const [mounted, setMounted] = useState(false);
  const [remaining, setRemaining] = useState(AD_GATE_MAX_SECONDS);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timers must not run during SSR.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || adFree || done) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setDone(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mounted, adFree, done]);

  const pushed = useRef(false);
  useEffect(() => {
    if (!mounted || adFree || done || !configured || pushed.current) return;
    try {
      (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle =
        (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle || [];
      (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle.push({});
      pushed.current = true;
    } catch {
      // never let ad-loading errors block the game
    }
  }, [mounted, adFree, done, configured]);

  // Auto-continue the moment the gate clears, without a second click.
  const notified = useRef(false);
  useEffect(() => {
    if (!onDone || notified.current) return;
    if (adFree || done || !configured) {
      notified.current = true;
      onDone();
    }
  }, [adFree, configured, done, onDone]);

  // Never make somebody wait through a pretend ad. Until Google supplies a
  // real interstitial slot, open the game immediately.
  if (!mounted || adFree || done || !configured) return <>{children}</>;

  const watched = AD_GATE_MAX_SECONDS - remaining;
  const skippable = watched >= AD_GATE_MIN_SECONDS;
  const progress = (watched / AD_GATE_MAX_SECONDS) * 100;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border border-border bg-card/40 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        {label ? `Getting ${label} ready…` : "Getting your game ready…"}
      </p>

      <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
        <ins
          className="adsbygoogle block h-full w-full"
          style={{ display: "block" }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={AD_SLOTS.interstitial}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>

      <Progress value={progress} className="w-full" />

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {remaining > 0 ? `${remaining}s remaining` : "Starting…"}
        </span>
        <Button size="sm" variant="secondary" disabled={!skippable} onClick={() => setDone(true)}>
          Skip
        </Button>
      </div>
    </div>
  );
}

/** Convenience wrapper: AdGate + AdRail around a game so pages need only one wrapper. */
export function GameSurface({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <AdRail />
      <AdGate label={label}>{children}</AdGate>
    </div>
  );
}
