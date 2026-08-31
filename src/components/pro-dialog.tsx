/**
 * The single "go Pro" pitch dialog: ad-free browsing.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PLANS, SUPPORT_EMAIL } from "@/lib/plans";
import { useAuth } from "@/lib/auth";

export function ProDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const pro = PLANS.find((p) => p.id === "pro")!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Go Pro
          </DialogTitle>
          <DialogDescription>
            Remove ads across DAP Games and play without interruptions.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {pro.benefits.map((b) => (
            <li key={b} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {b}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Upgrades are arranged personally — email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          and we'll set your account up.
        </p>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          {user ? (
            <Button asChild style={{ background: "var(--gradient-brand)" }} className="text-primary-foreground">
              <Link to="/account" onClick={() => onOpenChange(false)}>
                Go to your plan
              </Link>
            </Button>
          ) : (
            <Button asChild style={{ background: "var(--gradient-brand)" }} className="text-primary-foreground">
              <Link to="/login" onClick={() => onOpenChange(false)}>
                Sign in
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
