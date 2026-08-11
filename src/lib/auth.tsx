import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

export type User = { id: string; email: string; name: string };

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  ready: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: "google" | "github") => Promise<void>;
  signOut: () => Promise<void>;

};

const Ctx = createContext<AuthCtx | null>(null);

/**
 * Sign-in is sticky: the session is persisted (and mirrored into a cookie) so
 * closing the tab and opening a new one keeps you signed in. Only emailed
 * links (confirm / reset) carry the 10-minute expiry.
 */
const SESSION_COOKIE = "dapai_signed_in";

function writeSessionCookie(signedIn: boolean) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = signedIn
    ? `${SESSION_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`
    : `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}


function toUser(u: SupabaseUser | null | undefined): User | null {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? "",
    name:
      (u.user_metadata?.name as string | undefined) ||
      (u.email ? u.email.split("@")[0] : "friend"),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      if (event === "SIGNED_IN" && s) writeSessionCookie(true);
      if (event === "SIGNED_OUT") writeSessionCookie(false);
      setSession(s);
      setUser(toUser(s?.user));
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("[auth] getSession error:", error.message);
      }
      writeSessionCookie(!!data.session);
      setSession(data.session);
      setUser(toUser(data.session?.user));
      setLoading(false);
      setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router, queryClient]);


  const value: AuthCtx = {
    user,
    session,
    loading,
    ready,
    signUp: async (email, password, name) => {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { name },
        },
      });
      if (error) throw error;
    },
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // Accounts stay on hold until the emailed confirmation link is used.
      if (data.user && !data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        throw new Error(
          "Please confirm your email first — check your inbox for the DAP AI confirmation link."
        );
      }
    },

    signInWithProvider: async (provider) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams:
            provider === "google"
              ? { access_type: "offline", prompt: "consent" }
              : undefined,
        },
      });
      if (error) throw error;
    },

    signOut: async () => {

      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}
