import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const IOS_TIP_KEY = "dap.installTipDismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes its own flag rather than a display-mode match.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && safari;
}

/**
 * "Download App" affordance.
 *
 * Chrome/Android/desktop hand us a `beforeinstallprompt` event; we hold it
 * and drive the native prompt from our own button. iOS never fires it, so
 * those users get a one-off Share-sheet tip instead.
 */
export function InstallAppButton({ className, variant = "ghost" }: { className?: string; variant?: "ghost" | "outline" | "default" }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosTip, setIosTip] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (isIosSafari() && localStorage.getItem(IOS_TIP_KEY) !== "1") setIosTip(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (!promptEvent && iosTip) {
    return (
      <div className={cn("relative", className)}>
        <Button variant={variant} size="sm" className="gap-1.5" onClick={() => setTipOpen((v) => !v)}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Get App</span>
        </Button>
        {tipOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground shadow-lg">
            <button
              type="button"
              aria-label="Dismiss"
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                localStorage.setItem(IOS_TIP_KEY, "1");
                setIosTip(false);
                setTipOpen(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="pr-5 font-medium text-foreground">Install DAP AI</p>
            <p className="mt-1 flex items-center gap-1">
              Tap the <Share className="inline h-3.5 w-3.5" /> Share icon, then Add to Home Screen.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!promptEvent) return null;

  return (
    <Button
      variant={variant}
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={async () => {
        const event = promptEvent;
        setPromptEvent(null);
        try {
          await event.prompt();
          await event.userChoice;
        } catch {
          /* user closed the prompt */
        }
      }}
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Download App</span>
    </Button>
  );
}
