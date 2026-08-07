/**
 * Short branded intro that plays right after a user confirms their account.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import intro from "@/assets/dap-ai-intro.mp4.asset.json";

export function DapIntro({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    videoRef.current?.play().catch(() => {
      /* autoplay blocked — user can still watch or skip */
    });
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <video
          ref={videoRef}
          src={intro.url}
          className="aspect-video w-full bg-black"
          autoPlay
          muted
          playsInline
          onEnded={onClose}
          controls={false}
        />
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-semibold">Welcome to DAP AI 🎉</p>
            <p className="text-xs text-muted-foreground">
              Your account is confirmed — here's a quick look around.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
