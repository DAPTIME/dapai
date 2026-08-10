import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { completeAccountReinstatement } from "@/lib/recovery.functions";

export const Route = createFileRoute("/reinstate")({
  head: () => ({
    meta: [
      { title: "Restore access — DAP AI" },
      {
        name: "description",
        content: "Restore access to your DAP AI account and set a new recovery question.",
      },
      { property: "og:title", content: "Restore access — DAP AI" },
      {
        property: "og:description",
        content: "Set a new password and recovery question for your DAP AI account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReinstatePage,
});

function ReinstatePage() {
  const navigate = useNavigate();
  const complete = useServerFn(completeAccountReinstatement);

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(10 * 60);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
    setToken(params.get("token") ?? "");
  }, []);

  // The link itself is valid for 10 minutes; show the countdown.
  useEffect(() => {
    const t = window.setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !token) {
      toast.error("This restore link is incomplete. Please request a new one.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    if (question.trim().length < 3 || answer.trim().length < 2) {
      toast.error("Please set a recovery question and answer.");
      return;
    }
    setBusy(true);
    try {
      await complete({
        data: {
          email,
          token,
          newPassword: password,
          newQuestion: question.trim(),
          newAnswer: answer.trim(),
        },
      });
      toast.success("Access restored. You can sign in now.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore access.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Restore your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Set a new password and a recovery question for{" "}
        <span className="font-medium text-foreground">{email || "your account"}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="question">Recovery question</Label>
          <Input
            id="question"
            required
            minLength={3}
            placeholder="e.g. What was my first pet's name?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="answer">Recovery answer</Label>
          <Input
            id="answer"
            required
            minLength={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          This link expires in{" "}
          <span className="font-medium text-foreground">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>{" "}
          — restore links are valid for 10 minutes and single-use.
        </p>

        <Button
          type="submit"
          disabled={busy}
          className="w-full"
          style={{ background: "var(--gradient-brand)" }}
        >
          {busy ? "Saving…" : "Restore access"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
