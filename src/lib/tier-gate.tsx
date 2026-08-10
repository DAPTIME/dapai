/**
 * Tier gating + a single shared "upgrade" dialog.
 *
 * Any component can ask `requireTier("pro", "Beta features")`. If the signed-in
 * account isn't high enough (or nobody is signed in), the upgrade screen pops
 * up and the call returns false so the caller can bail out.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Check } from "lucide-react";
import { PLANS, SUPPORT_EMAIL, LINKTREE_URL } from "@/lib/plans";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { getProfile } from "@/lib/chats.functions";

export type Tier = "free" | "go" | "pro" | "exclusive";

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  go: 1,
  pro: 2,
  exclusive: 3,
};

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  go: "Go",
  pro: "Pro",
  exclusive: "Exclusive",
};

interface GateCtx {
  tier: Tier;
  ready: boolean;
  hasTier: (min: Tier) => boolean;
  /** Returns true when allowed; otherwise shows the upgrade screen. */
  requireTier: (min: Tier, feature?: string) => boolean;
  openUpgrade: (min: Tier, feature?: string) => void;
}

const Ctx = createContext<GateCtx | null>(null);

export function UpgradeGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getProfile);
  const profile = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const [dialog, setDialog] = useState<{ min: Tier; feature?: string } | null>(
    null
  );

  const tier = ((profile.data?.tier as Tier | undefined) ?? "free") as Tier;
  const ready = !user || profile.isSuccess || profile.isError;

  const hasTier = useCallback(
    (min: Tier) => !!user && TIER_RANK[tier] >= TIER_RANK[min],
    [tier, user]
  );

  const openUpgrade = useCallback((min: Tier, feature?: string) => {
    setDialog({ min, feature });
  }, []);

  const requireTier = useCallback(
    (min: Tier, feature?: string) => {
      if (hasTier(min)) return true;
      openUpgrade(min, feature);
      return false;
    },
    [hasTier, openUpgrade]
  );

  const value = useMemo(
    () => ({ tier, ready, hasTier, requireTier, openUpgrade }),
    [tier, ready, hasTier, requireTier, openUpgrade]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <UpgradeDialog
        open={!!dialog}
        min={dialog?.min}
        feature={dialog?.feature}
        currentTier={user ? tier : null}
        onClose={() => setDialog(null)}
      />
    </Ctx.Provider>
  );
}

function UpgradeDialog({
  open,
  min,
  feature,
  currentTier,
  onClose,
}: {
  open: boolean;
  min?: Tier;
  feature?: string;
  currentTier: Tier | null;
  onClose: () => void;
}) {
  const [claiming, setClaiming] = useState<Tier | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="text-2xl font-semibold tracking-tight">
              Upgrade your plan
            </DialogTitle>
            <DialogDescription>
              {feature
                ? `${feature} is available on ${min ? TIER_LABEL[min] : "Pro"} and above.`
                : "Pick the plan that fits how you use DAP AI."}
              {currentTier
                ? ` You're currently on ${TIER_LABEL[currentTier]}.`
                : " Sign in to upgrade your account."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const isCurrent = currentTier === plan.id;
              const recommended =
                (min && plan.id === min) || (!min && plan.highlight);
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                    recommended
                      ? "border-primary/60 bg-primary/5 shadow-[0_0_0_1px_var(--color-primary)] "
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  {recommended && (
                    <span
                      className="absolute -top-2.5 left-5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground"
                      style={{ background: "var(--gradient-brand)" }}
                    >
                      Recommended
                    </span>
                  )}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.tagline}
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {plan.benefits.map((b) => (
                      <li key={b} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{b}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    {isCurrent ? (
                      <Button variant="outline" className="w-full" disabled>
                        Your current plan
                      </Button>
                    ) : plan.id === "free" ? (
                      <Button variant="outline" className="w-full" disabled>
                        Included for everyone
                      </Button>
                    ) : (
                      <Button
                        className="w-full text-primary-foreground"
                        style={{ background: "var(--gradient-brand)" }}
                        onClick={() => setClaiming(plan.id as Tier)}
                      >
                        Upgrade to {plan.name}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!currentTier && (
            <DialogFooter className="sm:justify-center">
              <Button asChild variant="outline" onClick={onClose}>
                <Link to="/login">Sign in</Link>
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!claiming} onOpenChange={(o) => !o && setClaiming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {claiming ? `Get ${TIER_LABEL[claiming]}` : "Get in touch"}
            </DialogTitle>
            <DialogDescription>
              Upgrades are handled personally, so we know who we're building for.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  `DAP AI ${claiming ? TIER_LABEL[claiming] : ""} upgrade request`
                )}`}
                className="font-medium text-primary underline"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              and tell us:
            </p>
            <ul className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-muted-foreground">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Which plan you want and why DAP AI would help you
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                How long you've been using DAP AI
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                A bit about yourself
              </li>
            </ul>
            <p className="text-muted-foreground">
              You can also reach the team through our links:{" "}
              <a
                href={LINKTREE_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline"
              >
                {LINKTREE_URL.replace(/^https?:\/\//, "")}
              </a>
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setClaiming(null)}>
              Back
            </Button>
            <Button
              asChild
              className="text-primary-foreground"
              style={{ background: "var(--gradient-brand)" }}
            >
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  `DAP AI ${claiming ? TIER_LABEL[claiming] : ""} upgrade request`
                )}`}
              >
                Email us
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


export function useUpgradeGate(): GateCtx {
  const c = useContext(Ctx);
  if (!c)
    throw new Error("useUpgradeGate must be used inside <UpgradeGateProvider>");
  return c;
}
