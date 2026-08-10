/**
 * Google / GitHub sign-in buttons. Both providers use Supabase OAuth and land
 * back on /auth/callback, which waits for the session before entering the app.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.44a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.61-5.15 3.61-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.92l-3.86-3c-1.07.72-2.44 1.15-4.09 1.15-3.14 0-5.8-2.12-6.75-4.97H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.26a7.2 7.2 0 0 1 0-4.52v-3.1H1.28a12 12 0 0 0 0 10.72l3.97-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.64l3.97 3.1C6.2 6.87 8.86 4.75 12 4.75Z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.55v-1.95c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.04 1.78 2.72 1.27 3.38.97.11-.76.41-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.14 1.18a10.9 10.9 0 0 1 5.72 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.15v3.18c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function SocialAuthButtons({ label = "or continue with" }: { label?: string }) {
  const { signInWithProvider } = useAuth();
  const [pending, setPending] = useState<"google" | "github" | null>(null);

  const go = async (provider: "google" | "github") => {
    setPending(provider);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setPending(null);
      toast.error(
        err instanceof Error
          ? err.message
          : `Couldn't start ${provider === "google" ? "Google" : "GitHub"} sign-in`,
      );
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-4 grid gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          disabled={pending !== null}
          onClick={() => void go("google")}
        >
          <GoogleMark />
          {pending === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          disabled={pending !== null}
          onClick={() => void go("github")}
        >
          <GitHubMark />
          {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
        </Button>
      </div>
    </div>
  );
}
