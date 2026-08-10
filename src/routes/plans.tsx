import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { getProfile } from "@/lib/chats.functions";
import { useAuth } from "@/lib/auth";
import {
  EXCLUSIVE_CONTACT_URL,
  TIERS,
  TIER_CONFIG,
  type Tier,
} from "@/lib/tiers";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Plans & Pricing — DAP AI" },
      {
        name: "description",
        content:
          "Compare DAP AI plans: Free, Go, Pro and Exclusive. See usage tokens, prompt and response limits, image quotas, web search and memory for each tier.",
      },
      { property: "og:title", content: "Plans & Pricing — DAP AI" },
      {
        property: "og:description",
        content:
          "DAP AI 4 Lite, 4 Pro Lite and 4 Pro — usage tokens, image quotas, web search and memory compared side by side.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlansPage,
});

const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  go: "Go",
  pro: "Pro",
  exclusive: "Exclusive",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border/60 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function Yes() {
  return <Check className="ml-auto h-4 w-4 text-primary" aria-label="Included" />;
}
function No() {
  return (
    <X className="ml-auto h-4 w-4 text-muted-foreground" aria-label="Not included" />
  );
}

function PlansPage() {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getProfile);
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const currentTier = (profileQuery.data?.tier as Tier | undefined) ?? null;
  // Payments aren't live yet, so "How to get X" explains the manual upgrade.
  const [upgradeAsk, setUpgradeAsk] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Plans &amp; pricing
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every plan runs on DAP AI. Higher tiers get longer prompts and replies,
        more usage tokens, more images, web search and memory. Tiers are
        assigned by the DAP AI team — there's no checkout here.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((id) => {
          const cfg = TIER_CONFIG[id];
          const isCurrent = currentTier === id;
          return (
            <div
              key={id}
              className={`flex flex-col rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] transition ${
                isCurrent ? "border-primary/60" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{TIER_LABELS[id]}</h2>
                {isCurrent && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                    Your plan
                  </span>
                )}
              </div>
              <p
                className="mt-1 text-sm font-medium"
                style={{
                  backgroundImage: "var(--gradient-text)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {cfg.productName}
              </p>
              <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">
                {cfg.tagline ?? "\u00A0"}
              </p>

              <div className="mt-3">
                <Row
                  label="Usage tokens / day"
                  value={cfg.dailyTokens === null ? "Unlimited" : cfg.dailyTokens}
                />
                <Row
                  label="Usage tokens / week"
                  value={cfg.weeklyTokens === null ? "Unlimited" : cfg.weeklyTokens}
                />
                <Row
                  label="Max prompt"
                  value={`${cfg.maxPromptTokens.toLocaleString()} tokens`}
                />
                <Row
                  label="Max response"
                  value={`${cfg.maxResponseTokens.toLocaleString()} tokens`}
                />
                <Row
                  label="Images / response"
                  value={
                    cfg.maxImagesPerResponse === null
                      ? "No limit"
                      : cfg.maxImagesPerResponse
                  }
                />
                <Row
                  label="Images / day"
                  value={
                    cfg.maxImagesPerDay === null
                      ? `Unlimited${cfg.imageQuality === "best" ? " · best quality" : ""}`
                      : cfg.maxImagesPerDay
                  }
                />
                <Row label="Web search" value={cfg.webSearch ? <Yes /> : <No />} />
                <Row label="Memory" value={cfg.memory ? <Yes /> : <No />} />
              </div>

              <div className="mt-5">
                {id === "exclusive" ? (
                  <Button
                    asChild
                    className="w-full"
                    style={{ background: "var(--gradient-brand)" }}
                  >
                    <a
                      href={EXCLUSIVE_CONTACT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Contact Us <ExternalLink className="ml-1.5 h-4 w-4" />
                    </a>
                  </Button>
                ) : isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setUpgradeAsk(TIER_LABELS[id])}
                  >
                    How to get {TIER_LABELS[id]}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={upgradeAsk !== null}
        onOpenChange={(open) => !open && setUpgradeAsk(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upgrading to {upgradeAsk}</DialogTitle>
            <DialogDescription>
              DAP AI doesn't have payments fully set up yet, so please contact
              the owner and request an upgrade to {upgradeAsk}. Once approved,
              your plan is applied to your account instantly — no checkout
              needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setUpgradeAsk(null)}>
              Close
            </Button>
            <Button asChild style={{ background: "var(--gradient-brand)" }}>
              <a
                href={EXCLUSIVE_CONTACT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Contact the owner <ExternalLink className="ml-1.5 h-4 w-4" />
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-10 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <h2 className="text-base font-medium text-foreground">
          How usage tokens work
        </h2>
        <p className="mt-2">
          Each message costs between 1 and 4.5 usage tokens depending on how
          long it is compared to your plan's maximum prompt size — short
          messages cost 1, near-maximum messages cost 4.5. Anything over your
          plan's prompt limit is rejected before it's sent, and nothing is
          deducted. Daily budgets reset at 00:00 UTC; weekly budgets reset every
          Monday at 00:00 UTC. Exclusive has no usage-token budget at all.
        </p>
      </div>
    </div>
  );
}
