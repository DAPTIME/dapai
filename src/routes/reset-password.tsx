import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";

import { resetPasswordWithLink } from "@/lib/recovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({
  token: z.string().optional(),
  email: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Reset your password · DAP AI" },
      {
        name: "description",
        content:
          "Use your secure DAP AI link to set a new password and a new account recovery question.",
      },
      { property: "og:title", content: "Reset your password · DAP AI" },
      {
        property: "og:description",
        content:
          "Set a new DAP AI password and recovery question with your secure reset link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, email } = Route.useSearch();
  const navigate = useNavigate();
  const submit = useServerFn(resetPasswordWithLink);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = !!token && !!email;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
    if (question.trim().length < 3 || answer.trim().length < 2) {
      toast.error("Please set a new recovery question and answer.");
      return;
    }
    setBusy(true);
    try {
      await submit({
        data: {
          email: email!,
          token: token!,
          newPassword: password,
          newQuestion: question.trim(),
          newAnswer: answer.trim(),
        },
      });
      toast.success("Password and recovery question updated. You can sign in now.");
      void navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>

      {!valid ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            This reset link is incomplete or has already been used. Reset links
            expire after 10 minutes — request a fresh one to continue.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/forgot-password">Get a new reset link</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Resetting for <span className="text-foreground">{email}</span>. Choose a
            new password and a new recovery question — this link works once and
            expires 10 minutes after it was sent.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm new password</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="q">New recovery question</Label>
              <Input
                id="q"
                placeholder="e.g. What was my first pet's name?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a">New recovery answer</Label>
              <Input
                id="a"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save password and recovery question"}
            </Button>
          </form>
        </>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
