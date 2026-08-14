/**
 * Plan and usage, on the account page.
 *
 * Changing plan used to happen in a dialog that could be opened from
 * anywhere, which meant the one place a person looks for their plan — the
 * account page — did not mention it. Upgrading and downgrading live here
 * now; the dialog still exists, but only to explain why a feature is
 * locked, and its button sends you here.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { getMyUsage } from "@/lib/usage.functions";
import { downgradeOwnTier } from "@/lib/tier.functions";
import { TIER_LABEL, TIER_RANK, type Tier } from "@/lib/tier-rank";
import { PLANS, LINKTREE_URL } from "@/lib/plans";

/** Trim trailing zeros: 1.25 stays, 2.00 becomes 2. */
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));

/** A used/allowed line with a bar, or a plain count when there's no cap. */
function Meter({ label, used, limit, note }: {
  label: string;
  used: number;
  limit: number | null;
  note?: string;
}) {
  const unlimited = limit === null || !Number.isFinite(limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const full = !unlimited && used >= (limit as number);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className={full ? "text-destructive" : "text-muted-foreground"}>
          {unlimited ? `${fmt(used)} — no limit` : `${fmt(used)} of ${limit}`}
        </span>
      </div>
      {!unlimited && (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: full ? "hsl(var(--destructive))" : "var(--gradient-brand)",
            }}
          />
        </div>
      )}
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function PlanAndUsage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchUsage = useServerFn(getMyUsage);
  const downgrade = useServerFn(downgradeOwnTier);
  const [leaving, setLeaving] = useState<Tier | null>(null);

  const usage = useQuery({
    queryKey: ["my-usage", user?.id],
    queryFn: () => fetchUsage(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const drop = useMutation({
    mutationFn: (tier: Tier) => downgrade({ data: { tier } }),
    onSuccess: (res) => {
      setLeaving(null);
      queryClient.invalidateQueries({ queryKey: ["my-usage"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(`You're on ${TIER_LABEL[res.to as Tier]} now.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change plan"),
  });

  if (!user) return null;

  const tier = usage.data?.tier ?? "free";
  const rank = TIER_RANK[tier];
  const top = rank >= TIER_RANK.exclusive;

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Your plan</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold text-primary-foreground"
                style={{ background: "var(--gradient-brand)" }}
              >
                {TIER_LABEL[tier]}
              </span>
              {top ? "The highest plan — nothing above this." : "Change it any time."}
            </p>
          </div>

          {/* Nothing to sell to someone already at the top. */}
          {!top && (
            <Button
              asChild
              size="sm"
              className="gap-1 text-primary-foreground"
              style={{ background: "var(--gradient-brand)" }}
            >
              <a href={LINKTREE_URL} target="_blank" rel="noreferrer">
                <Sparkles className="h-3.5 w-3.5" />
                Upgrade
              </a>
            </Button>
          )}
        </div>

        <div className="mt-5 space-y-4">
          {usage.isLoading && (
            <p className="text-sm text-muted-foreground">Loading your usage…</p>
          )}
          {usage.isError && (
            <p className="text-sm text-destructive">Couldn't load your usage right now.</p>
          )}
          {usage.data && (
            <>
              <Meter
                label="Chat history"
                used={usage.data.chats.used}
                limit={usage.data.chats.limit}
                note="Older chats are pruned when you start a new one."
              />
              <Meter
                label="DAP Track levels"
                used={usage.data.tracks.used}
                limit={Number.isFinite(usage.data.tracks.limit) ? usage.data.tracks.limit : null}
              />
              <Meter
                label="Usage tokens today"
                used={usage.data.tokensToday.used}
                limit={usage.data.tokensToday.limit}
                note="Resets at midnight UTC."
              />
              <Meter
                label="Usage tokens this week"
                used={usage.data.tokensWeek.used}
                limit={usage.data.tokensWeek.limit}
                note="Your week runs seven days from your first message in it."
              />
              <Meter
                label="Images today"
                used={usage.data.imagesToday.used}
                limit={usage.data.imagesToday.limit}
              />
            </>
          )}
        </div>

        {rank > TIER_RANK.free && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <span className="w-full text-xs text-muted-foreground">Move to a smaller plan:</span>
            {(Object.keys(TIER_RANK) as Tier[])
              .filter((t) => TIER_RANK[t] < rank)
              .sort((a, b) => TIER_RANK[b] - TIER_RANK[a])
              .map((t) => (
                <Button key={t} size="sm" variant="outline" onClick={() => setLeaving(t)}>
                  Downgrade to {TIER_LABEL[t]}
                </Button>
              ))}
          </div>
        )}
      </div>

      <Dialog open={!!leaving} onOpenChange={(o) => !o && setLeaving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>We're sad to see you go from {TIER_LABEL[tier]}</DialogTitle>
            <DialogDescription>
              You'll move to {leaving ? TIER_LABEL[leaving] : ""} straight away and keep
              access to everything that plan includes.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            {(PLANS.find((p) => p.id === leaving)?.benefits ?? []).slice(0, 3).map((f: string) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setLeaving(null)}>
              Stay on {TIER_LABEL[tier]}
            </Button>
            <Button
              disabled={drop.isPending}
              onClick={() => leaving && drop.mutate(leaving)}
            >
              {drop.isPending ? "Changing…" : "Proceed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
