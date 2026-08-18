import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — DAP AI" },
      {
        name: "description",
        content: "Finishing your DAP AI sign-in. This only takes a moment.",
      },
      { property: "og:title", content: "Signing you in — DAP AI" },
      {
        property: "og:description",
        content: "Completing your Google or GitHub sign-in for DAP AI.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Supabase reports failures in the hash fragment, not the query string
    // (#error=access_denied&error_description=…). Reading only ?search meant
    // an expired confirmation link showed a spinner for twelve seconds and
    // then a generic "took too long", with the actual reason sitting in the
    // URL the whole time. Read both, prefer the specific message.
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    const oauthError =
      hashParams.get("error_description") ??
      params.get("error_description") ??
      hashParams.get("error") ??
      params.get("error") ??
      null;
    if (oauthError) {
      setError(oauthError.replace(/\+/g, " "));
      return;
    }

    // supabase-js parses the OAuth response and emits SIGNED_IN. Wait for the
    // session rather than assuming it's ready on first render.
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      navigate({ to: "/", replace: true });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setError("Sign-in took too long. Please try again.");
      }
    }, 12_000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-semibold">Couldn't complete sign-in</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <a
            href="/login"
            className="text-sm font-medium underline underline-offset-4"
          >
            Back to sign in
          </a>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        </>
      )}
    </div>
  );
}
