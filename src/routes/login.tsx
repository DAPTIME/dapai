import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { isValidEmail } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — DAP AI" },
      {
        name: "description",
        content: "Sign in to your DAP AI account to continue your chats.",
      },
      { property: "og:title", content: "Sign in to DAP AI" },
      {
        property: "og:description",
        content:
          "Log in to DAP AI to pick up your conversations, access saved chats, and use your DAPs.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/login" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user, ready } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) {
      navigate({ to: "/" });
    }
  }, [ready, user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (!password) {
      toast.error("Please enter your password.");
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
      toast.success("Welcome back");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col items-center justify-center px-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to DAP AI</h1>
      <p className="mt-1 text-sm text-muted-foreground">Welcome back. Enter your details to continue.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy} className="w-full" style={{ background: "var(--gradient-brand)" }}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-3 text-center text-sm">
        <Link to="/forgot-password" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Forgot password?
        </Link>
      </p>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
