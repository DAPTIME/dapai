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

/** Login sessions expire 5 minutes after sign-in. */
const SESSION_TTL_MS = 5 * 60 * 1000;
const SESSION_START_KEY = "dapai.session_started_at";


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
      if (event === "SIGNED_IN" && s) {
        localStorage.setItem(SESSION_START_KEY, String(Date.now()));
      }
      if (event === "SIGNED_OUT") {
        localStorage.removeItem(SESSION_START_KEY);
      }
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
      if (data.session) {
        const started = Number(localStorage.getItem(SESSION_START_KEY) || 0);
        if (!started) {
          localStorage.setItem(SESSION_START_KEY, String(Date.now()));
        }
      }
      setSession(data.session);
      setUser(toUser(data.session?.user));
      setLoading(false);
      setReady(true);
    });

    // Enforce the 5-minute session lifetime.
    const timer = window.setInterval(() => {
      const started = Number(localStorage.getItem(SESSION_START_KEY) || 0);
      if (!started) return;
      if (Date.now() - started >= SESSION_TTL_MS) {
        localStorage.removeItem(SESSION_START_KEY);
        void supabase.auth.signOut();
      }
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
