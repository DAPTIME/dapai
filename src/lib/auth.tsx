import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Local accounts system (mock).
 *
 * Stores users + session in localStorage so the UI works end-to-end today.
 * When you connect Supabase later, swap the four functions below
 * (signUp / signIn / signOut / getSession) to call supabase.auth.* —
 * the rest of the app (useAuth hook, login/signup pages, header menu)
 * does not need to change.
 */

export type User = { id: string; email: string; name: string };

type StoredUser = User & { password: string };

const USERS_KEY = "dapai.users";
const SESSION_KEY = "dapai.session";

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeUsers(u: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}

export async function signUp(email: string, password: string, name: string): Promise<User> {
  email = email.trim().toLowerCase();
  if (!email || !password) throw new Error("Email and password are required");
  if (password.length < 6) throw new Error("Password must be at least 6 characters");
  const users = readUsers();
  if (users.some((u) => u.email === email)) throw new Error("An account with this email already exists");
  const user: StoredUser = {
    id: crypto.randomUUID(),
    email,
    name: name.trim() || email.split("@")[0],
    password,
  };
  users.push(user);
  writeUsers(users);
  const { password: _p, ...safe } = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
  return safe;
}

export async function signIn(email: string, password: string): Promise<User> {
  email = email.trim().toLowerCase();
  const user = readUsers().find((u) => u.email === email);
  if (!user || user.password !== password) throw new Error("Invalid email or password");
  const { password: _p, ...safe } = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
  return safe;
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): User | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

// ---- React context ----

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getSession());
    setLoading(false);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) setUser(getSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value: AuthCtx = {
    user,
    loading,
    signUp: async (e, p, n) => setUser(await signUp(e, p, n)),
    signIn: async (e, p) => setUser(await signIn(e, p)),
    signOut: () => {
      signOut();
      setUser(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}
