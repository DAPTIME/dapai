import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  changePasswordWithAnswer,
  changeRecoveryQuestion,
  getMyRecoveryQuestion,
} from "@/lib/recovery.functions";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — DAP AI" },
      {
        name: "description",
        content:
          "Change your DAP AI password or update your recovery question by answering the current one.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  const getQ = useServerFn(getMyRecoveryQuestion);
  const qQuery = useQuery({
    queryKey: ["my-recovery-question", user?.id ?? "anon"],
    queryFn: () => getQ(),
    enabled: !!user,
  });

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Security</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your password and recovery question.
      </p>

      <div className="mt-8 space-y-6">
        <ChangePasswordCard
          hasQuestion={!!qQuery.data?.question}
          question={qQuery.data?.question ?? null}
        />
        <ChangeRecoveryCard
          hasQuestion={!!qQuery.data?.question}
          currentQuestion={qQuery.data?.question ?? null}
        />
      </div>
    </div>
  );
}

function ChangePasswordCard({
  hasQuestion,
  question,
}: {
  hasQuestion: boolean;
  question: string | null;
}) {
  const changePw = useServerFn(changePasswordWithAnswer);
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mut = useMutation({
    mutationFn: () => changePw({ data: { answer, newPassword } }),
    onSuccess: () => {
      toast.success("Password updated.");
      setAnswer("");
      setNewPassword("");
      setConfirm("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    mut.mutate();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <Label className="text-base">Change password</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Verify your recovery answer, then set a new password.
          </p>
        </div>
      </div>

      {!hasQuestion ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Set a recovery question below first — you'll need it to change your
          password.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label>Your recovery question</Label>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              {question}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cur-answer">Answer</Label>
            <Input
              id="cur-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pw">Confirm new password</Label>
            <Input
              id="confirm-pw"
              type="password"
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={mut.isPending || !answer || !newPassword}
              style={{ background: "var(--gradient-brand)" }}
            >
              {mut.isPending ? "Updating…" : "Update password"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

function ChangeRecoveryCard({
  hasQuestion,
  currentQuestion,
}: {
  hasQuestion: boolean;
  currentQuestion: string | null;
}) {
  const qc = useQueryClient();
  const change = useServerFn(changeRecoveryQuestion);

  const [currentAnswer, setCurrentAnswer] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      change({ data: { currentAnswer, newQuestion, newAnswer } }),
    onSuccess: () => {
      toast.success("Recovery question updated.");
      setCurrentAnswer("");
      setNewQuestion("");
      setNewAnswer("");
      qc.invalidateQueries({ queryKey: ["my-recovery-question"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newQuestion.trim().length < 3) {
      toast.error("New question is too short.");
      return;
    }
    if (newAnswer.trim().length < 2) {
      toast.error("New answer is too short.");
      return;
    }
    mut.mutate();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <Label className="text-base">Recovery question</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasQuestion
              ? "Answer your current question, then set a new one."
              : "You don't have a recovery question yet. Set one below."}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {hasQuestion && (
          <>
            <div className="space-y-2">
              <Label>Current question</Label>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                {currentQuestion}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cur-rec-answer">Current answer</Label>
              <Input
                id="cur-rec-answer"
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                required
              />
            </div>
          </>
        )}
        <div className="space-y-2">
          <Label htmlFor="new-q">New recovery question</Label>
          <Input
            id="new-q"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="e.g. What was the name of your first pet?"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-a">New answer</Label>
          <Input
            id="new-a"
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              mut.isPending ||
              (hasQuestion && !currentAnswer) ||
              !newQuestion ||
              !newAnswer
            }
            style={{ background: "var(--gradient-brand)" }}
          >
            {mut.isPending ? "Saving…" : hasQuestion ? "Update question" : "Save question"}
          </Button>
        </div>
      </div>
    </form>
  );
}
