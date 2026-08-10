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
import { Sparkles } from "lucide-react";
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
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {dialog ? `${TIER_LABEL[dialog.min]} plan required` : "Upgrade"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.feature ? `${dialog.feature} is ` : "This is "}
              available on {dialog ? TIER_LABEL[dialog.min] : "Pro"} and above.
              {user
                ? ` You're currently on ${TIER_LABEL[tier]}.`
                : " Sign in with an upgraded account to use it."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            Hand 5 AED to Devansh in person (or message him) and mention which
            plan you want — your account gets upgraded straight after.
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {!user && (
              <Button asChild variant="outline" onClick={() => setDialog(null)}>
                <Link to="/login">Sign in</Link>
              </Button>
            )}
            <Button
              className="text-primary-foreground"
              style={{ background: "var(--gradient-brand)" }}
              onClick={() => setDialog(null)}
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useUpgradeGate(): GateCtx {
  const c = useContext(Ctx);
  if (!c)
    throw new Error("useUpgradeGate must be used inside <UpgradeGateProvider>");
  return c;
}
