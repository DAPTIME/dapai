import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { setRecoveryQuestion } from "@/lib/recovery.functions";
import { isValidEmail } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — DAP AI" },
      {
        name: "description",
        content:
          "Create a free DAP AI account to save chats and unlock the DAP AI 3.2 model.",
      },
      { property: "og:title", content: "Create your free DAP AI account" },
      {
        property: "og:description",
        content:
          "Sign up free to save chats, sync across devices, and unlock the DAP AI 3.2 model.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/signup" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { signUp, signIn, user, ready } = useAuth();
  const navigate = useNavigate();
  const saveRecovery = useServerFn(setRecoveryQuestion);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) {
      navigate({ to: "/" });
    }
  }, [ready, user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);

    try {
      await signUp(email, password, name);
      try {
        await signIn(email, password);
        await saveRecovery({ data: { question: question.trim(), answer: answer.trim() } });
      } catch {
        // Email confirmation may be required; user can set it later from settings.
      }
      toast.success("Account created");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
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
      <h1 className="text-2xl font-semibold tracking-tight">Create your DAP AI account</h1>
      <p className="mt-1 text-sm text-muted-foreground">It only takes a moment.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Devansh" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground">At least 6 characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="question">Recovery question</Label>
          <Input
            id="question"
            required
            minLength={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What was the name of your first pet?"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="answer">Answer</Label>
          <Input
            id="answer"
            required
            minLength={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Used to reset your password later"
          />
          <p className="text-xs text-muted-foreground">
            Stored hashed. We'll ask for this if you forget your password.
          </p>
        </div>
        <Button type="submit" disabled={busy} className="w-full" style={{ background: "var(--gradient-brand)" }}>
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
