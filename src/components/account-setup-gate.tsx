/**
 * Accounts that existed before the backend move are flagged as needing setup.
 * The first time such a user signs in, this blocks the app until they pick a
 * new password and a new recovery question.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import {
  completeAccountSetup,
  getAccountSetupStatus,
} from "@/lib/recovery.functions";
import { checkPassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

export function AccountSetupGate() {
  const { user, ready } = useAuth();
  const queryClient = useQueryClient();
  const getStatus = useServerFn(getAccountSetupStatus);
  const complete = useServerFn(completeAccountSetup);

  const status = useQuery({
    queryKey: ["account-setup-status", user?.id ?? "anon"],
    queryFn: () => getStatus(),
    enabled: ready && !!user,
    staleTime: 5 * 60_000,
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const save = useMutation({
    mutationFn: () =>
      complete({ data: { newPassword: password, question, answer } }),
    onSuccess: async () => {
      toast.success("You're all set — thanks!");
      setPassword("");
      setConfirm("");
      setQuestion("");
      setAnswer("");
      await queryClient.invalidateQueries({ queryKey: ["account-setup-status"] });
      await queryClient.invalidateQueries({ queryKey: ["my-recovery-question"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't save that"),
  });

  if (!ready || !user || !status.data?.needsSetup) return null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const pwProblem = checkPassword(password);
    if (pwProblem) {
      toast.error(pwProblem);
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Finish setting up your account</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account was flagged for a security refresh. Your chats and data
          are safe — please choose a new password and a new recovery question
          before you continue.
        </p>


        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setup-pw">New password</Label>
            <Input
              id="setup-pw"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-pw2">Confirm new password</Label>
            <Input
              id="setup-pw2"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-q">Recovery question</Label>
            <Input
              id="setup-q"
              placeholder="e.g. What was my first pet's name?"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-a">Answer</Label>
            <Input
              id="setup-a"
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              You'll use this to reset your password if you forget it. It's
              stored hashed — keep it somewhere safe.
            </p>
          </div>
          <Button
            type="submit"
            disabled={save.isPending}
            className="w-full"
            style={{ background: "var(--gradient-brand)" }}
          >
            {save.isPending ? "Saving…" : "Save and continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
