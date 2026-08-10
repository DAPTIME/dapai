import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { isValidEmail } from "@/lib/utils";
import {
  getRecoveryQuestion,
  resetPasswordWithAnswer,
  sendPasswordResetLink,
} from "@/lib/recovery.functions";
import { checkPassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — DAP AI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const getQ = useServerFn(getRecoveryQuestion);
  const reset = useServerFn(resetPasswordWithAnswer);
  const sendLink = useServerFn(sendPasswordResetLink);

  const [step, setStep] = useState<"email" | "answer">("email");
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== "answer" || secondsLeft <= 0) return;
    const t = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          setStep("email");
          setToken(null);
          toast.error("Reset session expired. Please start again.");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [step, secondsLeft]);

  // Emails a secure single-use link (10 min) that sets password + recovery question.
  const onEmailLink = async () => {
    if (!isValidEmail(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await sendLink({
        data: { email, origin: window.location.origin },
      });
      toast.success(
        "Check your inbox — we sent a secure reset link. It expires in 10 minutes."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the email.");
    } finally {
      setBusy(false);
    }
  };

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const res = await getQ({ data: { email } });
      if (!res.question || !res.token) {
        toast.error("No recovery question is set for this email.");
        return;
      }
      setQuestion(res.question);
      setToken(res.token);
      setSecondsLeft(Math.floor((res.expiresInMs || 300000) / 1000));
      setStep("answer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  };

  const onResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("Reset session expired. Please start again.");
      setStep("email");
      return;
    }
    const pwProblem = checkPassword(newPassword);
    if (pwProblem) {
      toast.error(pwProblem);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    if (newQuestion.trim().length < 3 || newAnswer.trim().length < 2) {
      toast.error("Please set a new recovery question and answer.");
      return;
    }
    setBusy(true);

    try {
      await reset({
        data: {
          email,
          token,
          answer,
          newPassword,
          newQuestion: newQuestion.trim(),
          newAnswer: newAnswer.trim(),
        },
      });
      toast.success("Password and recovery question updated. You can sign in now.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your email and we'll ask your recovery question — or email you a secure reset link instead.
      </p>

      {step === "email" ? (
        <form onSubmit={onEmailSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full" style={{ background: "var(--gradient-brand)" }}>
            {busy ? "Looking up…" : "Continue"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="w-full"
            onClick={() => void onEmailLink()}
          >
            Email me a secure reset link instead
          </Button>
          <p className="text-xs text-muted-foreground">
            The emailed link lets you set a new password and a new recovery
            question without answering your old one. It works once and expires in
            10 minutes.
          </p>
        </form>
      ) : (
        <form onSubmit={onResetSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label>Your recovery question</Label>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              {question}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="answer">Your answer</Label>
            <Input
              id="answer"
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newQuestion">New recovery question</Label>
            <Input
              id="newQuestion"
              required
              minLength={3}
              placeholder="e.g. What was my first pet's name?"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newAnswer">New recovery answer</Label>
            <Input
              id="newAnswer"
              required
              minLength={2}
              value={newAnswer}
              onChange={(e) => setNewAnswer(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Finish within{" "}
            <span className="font-medium text-foreground">
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>{" "}
            — reset sessions expire after 10 minutes.
          </p>

          <Button type="submit" disabled={busy} className="w-full" style={{ background: "var(--gradient-brand)" }}>
            {busy ? "Saving…" : "Reset password"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
