import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Plus, Trash2, X, Lock, Crown, Store, Download, Globe, Check } from "lucide-react";
import { useState } from "react";
import { DAPS } from "@/lib/daps";
import { createChat, getProfile } from "@/lib/chats.functions";
import {
  listCustomDaps,
  createCustomDap,
  deleteCustomDap,
  submitCustomDap,
  unpublishCustomDap,
  listMyDapNotices,
  markDapNoticesSeen,
  listMarketplaceDaps,
  installMarketplaceDap,
} from "@/lib/custom-daps.functions";
import { useSiteConfig } from "@/lib/site-config";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
import { useFeatureGuard } from "@/lib/feature-guard";
import { useUpgradeGate } from "@/lib/tier-gate";
import { useAuth } from "@/lib/auth";
import { useNewChatGuard } from "@/lib/use-new-chat-guard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/daps")({
  head: () => ({
    meta: [
      { title: "Custom AI's — DAP AI" },
      {
        name: "description",
        content:
          "Build and chat with your own Custom AI's — Pro-only assistants for coding, studying, writing, planning, and focused tasks.",
      },
      { property: "og:title", content: "Custom AI's — DAP AI" },
      {
        property: "og:description",
        content:
          "Pro-only Custom AI's: tailor your own assistant for coding, studying, writing, planning, and focused tasks.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/daps" },
    ],
    links: [{ rel: "canonical", href: "https://dapai.lovable.app/daps" }],
  }),
  component: Daps,
});

function Daps() {
  const { requireTier, openUpgrade } = useUpgradeGate();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const create = useServerFn(createChat);
  const newChatGuard = useNewChatGuard();
  const listCustom = useServerFn(listCustomDaps);
  const createCustom = useServerFn(createCustomDap);
  const deleteCustom = useServerFn(deleteCustomDap);
  const submitDap = useServerFn(submitCustomDap);
  const unpublishDap = useServerFn(unpublishCustomDap);
  const listNotices = useServerFn(listMyDapNotices);
  const markSeen = useServerFn(markDapNoticesSeen);
  const listMarket = useServerFn(listMarketplaceDaps);
  const installDap = useServerFn(installMarketplaceDap);
  const siteConfig = useSiteConfig();
  const fetchProfile = useServerFn(getProfile);

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });
  const dapsEnabled = siteConfig.flags.daps;
  const dapsEnabledOff = useFeatureGuard(dapsEnabled ? null : "daps");

  const isPro =
    TIER_RANK[(profileQuery.data?.tier as Tier) ?? "free"] >= TIER_RANK.pro;

  const [showForm, setShowForm] = useState(false);

  const customQuery = useQuery({
    queryKey: ["custom-daps"],
    queryFn: () => listCustom(),
    enabled: !!user && dapsEnabled && isPro,
  });

  const marketQuery = useQuery({
    queryKey: ["daps-marketplace"],
    queryFn: () => listMarket(),
    enabled: !!user && dapsEnabled && isPro,
  });

  const refreshDaps = () => {
    qc.invalidateQueries({ queryKey: ["custom-daps"] });
    qc.invalidateQueries({ queryKey: ["daps-marketplace"] });
  };

  const submitMut = useMutation({
    mutationFn: (id: string) => submitDap({ data: { id } }),
    onSuccess: () => {
      refreshDaps();
      toast.success("Sent for review. You'll hear back here once it's looked at.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unpublishMut = useMutation({
    mutationFn: (id: string) => unpublishDap({ data: { id } }),
    onSuccess: () => {
      refreshDaps();
      toast.success("Taken off the marketplace.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* Decisions the moderator has made that this author has not been shown.
     Read once and marked seen, so a rejection is delivered exactly one time
     rather than greeting them on every visit. */
  const noticesQuery = useQuery({
    queryKey: ["dap-notices"],
    queryFn: () => listNotices(),
    enabled: !!user && dapsEnabled,
  });
  const notices = (noticesQuery.data ?? []) as Array<{
    id: string;
    name: string;
    emoji: string;
    moderation_status: string;
    rejection_reason: string | null;
  }>;

  const installMut = useMutation({
    mutationFn: (sourceId: string) => installDap({ data: { sourceId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-daps"] });
      qc.invalidateQueries({ queryKey: ["daps-marketplace"] });
      toast.success("Installed — it's now in your Custom AI's.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startDap = useMutation({
    mutationFn: async (dapId: string) => {
      const proceed = await newChatGuard.request();
      if (!proceed) return null;
      return create({ data: { dapId, incognito: typeof window !== "undefined" && localStorage.getItem("dap.incognito") === "1" } });
    },
    onSuccess: (chat) => {
      if (!chat) return;
      navigate({ to: "/c/$threadId", params: { threadId: chat.id } });
    },
    onError: (e: Error) =>
      toast.error(e?.message || "Couldn't start that Custom AI. Please try again."),
  });

  const removeCustom = useMutation({
    mutationFn: (id: string) => deleteCustom({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-daps"] });
      toast.success("Custom AI deleted.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const launch = (id: string) => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!requireTier("pro", "Custom AI's")) return;
    startDap.mutate(id);
  };

  if (dapsEnabledOff) return null;
  if (!dapsEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Custom AI's are temporarily disabled
        </h1>
        <p className="mt-3 text-muted-foreground">
          Custom AI's are turned off right now. Please check back soon.
        </p>
      </div>
    );
  }

  if (!user || !isPro) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Crown className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Custom AI's are a Pro feature
        </h1>
        <p className="mt-3 text-muted-foreground">
          Build your own assistants with custom instructions and personas.
          {user
            ? " Upgrade to Pro to create and chat with Custom AI's."
            : " Sign in with a Pro account to create and chat with Custom AI's."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {user ? (
            <Button
              className="text-primary-foreground"
              style={{ background: "var(--gradient-brand)" }}
              onClick={() => openUpgrade("pro", "Custom AI's")}
            >
              Upgrade to Pro
            </Button>
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link to="/signup">Create account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Custom AI's</h1>
          <p className="mt-2 text-muted-foreground">
            Specialized AI personas. Each Custom AI adds its own system prompt on top
            of the base DAP AI prompt.
          </p>
        </div>
        {user && (
          <Button onClick={() => setShowForm((s) => !s)} className="gap-2">
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "New Custom AI"}
          </Button>
        )}
      </div>

      {showForm && user && (
        <CustomDapForm
          onCreate={async (values) => {
            try {
              await createCustom({ data: values });
              qc.invalidateQueries({ queryKey: ["custom-daps"] });
              setShowForm(false);
              toast.success("Custom AI created.");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}

      {/* Moderator decisions. Shown once — dismissing marks them seen, which
          is also what the "told the next time they look" rule needs: the
          author finds out here, not by noticing their DAP quietly missing
          from the marketplace. */}
      {notices.length > 0 && (
        <section className="mt-8 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-medium">From the moderators</h2>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                markSeen().then(() => {
                  qc.invalidateQueries({ queryKey: ["dap-notices"] });
                });
              }}
            >
              Dismiss
            </Button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {notices.map((n) => (
              <li key={n.id} className="flex gap-2">
                <span aria-hidden>{n.emoji}</span>
                <span>
                  <span className="font-medium">{n.name}</span>{" "}
                  {n.moderation_status === "approved" ? (
                    <span className="text-muted-foreground">
                      was approved and is on the marketplace.
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      wasn't approved
                      {n.rejection_reason ? ` — ${n.rejection_reason}` : "."} You can
                      change it and send it again.
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user && customQuery.data && customQuery.data.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Your Custom AI's
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {customQuery.data.map((c) => (
              <div
                key={c.id}
                className="group relative rounded-2xl border border-border bg-card p-5 transition hover:border-ring/40 hover:shadow-[var(--shadow-soft)]"
              >
                <button
                  onClick={() => launch(`custom:${c.id}`)}
                  disabled={startDap.isPending}
                  className="block w-full text-left disabled:opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{c.emoji}</span>
                    <h3 className="font-medium">{c.name}</h3>
                    <Sparkles className="ml-auto h-4 w-4 text-primary opacity-0 transition group-hover:opacity-100" />
                  </div>
                  {c.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                </button>
                {/* Publishing is a request, not a switch: it goes to a
                    moderator first, so the button says what pressing it
                    actually does and then reports where the request got to. */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {c.published ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 rounded-full px-3 text-xs"
                        disabled={unpublishMut.isPending}
                        onClick={() => unpublishMut.mutate(c.id)}
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Unpublish
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Live · {c.install_count ?? 0} install
                        {(c.install_count ?? 0) === 1 ? "" : "s"}
                      </span>
                    </>
                  ) : c.moderation_status === "pending" ? (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      Waiting for review
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      disabled={submitMut.isPending}
                      onClick={() => submitMut.mutate(c.id)}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Submit for review
                    </Button>
                  )}
                  {c.moderation_status === "rejected" && (
                    <span className="text-xs text-destructive">
                      Rejected{c.rejection_reason ? ` — ${c.rejection_reason}` : ""}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    // Deleting a live DAP would pull it out from under
                    // whoever installed it, so unpublishing is a separate,
                    // deliberate first step.
                    if (c.published) {
                      toast.error("Unpublish it first, then you can delete it.");
                      return;
                    }
                    if (confirm(`Delete "${c.name}"?`)) removeCustom.mutate(c.id);
                  }}
                  className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  aria-label="Delete Custom AI"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          <Store className="h-3.5 w-3.5" /> Marketplace
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Custom AI's and MCP tools published by other Pro users. Install one and
          it appears in your own list.
        </p>
        {marketQuery.data && marketQuery.data.length > 0 ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {marketQuery.data.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-border bg-card p-5 transition hover:border-ring/40"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{m.emoji}</span>
                  <h3 className="font-medium">{m.name}</h3>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {m.install_count} install{m.install_count === 1 ? "" : "s"}
                  </span>
                </div>
                {m.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {m.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  by {m.author_name}
                  {m.mcp_url ? " · includes an MCP tool" : ""}
                </p>
                <div className="mt-3 flex gap-2">
                  {m.mine ? (
                    <span className="text-xs text-muted-foreground">
                      Your listing
                    </span>
                  ) : m.installed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5" /> Installed
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      disabled={installMut.isPending}
                      onClick={() => installMut.mutate(m.id)}
                    >
                      <Download className="h-3.5 w-3.5" /> Install
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => launch(`custom:${m.id}`)}
                  >
                    Try it
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing published yet. Publish one of yours to start the directory.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Built-in Custom AI's
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {DAPS.map((g) => (
            <button
              key={g.id}
              onClick={() => launch(g.id)}
              disabled={startDap.isPending}
              className="group text-left rounded-2xl border border-border bg-card p-5 transition hover:border-ring/40 hover:shadow-[var(--shadow-soft)] disabled:opacity-60"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{g.emoji}</span>
                <h3 className="font-medium">{g.name}</h3>
                <Sparkles className="ml-auto h-4 w-4 text-primary opacity-0 transition group-hover:opacity-100" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{g.desc}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CustomDapForm({
  onCreate,
}: {
  onCreate: (values: {
    name: string;
    description: string;
    emoji: string;
    systemPrompt: string;
    opener: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [opener, setOpener] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !systemPrompt.trim()) {
          toast.error("Name and instructions are required.");
          return;
        }
        setBusy(true);
        try {
          await onCreate({
            name: name.trim(),
            description: description.trim(),
            emoji: emoji.trim() || "✨",
            systemPrompt: systemPrompt.trim(),
            opener: opener.trim(),
          });
          setName("");
          setDescription("");
          setEmoji("✨");
          setSystemPrompt("");
          setOpener("");
        } finally {
          setBusy(false);
        }
      }}
      className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-[80px_1fr]">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Emoji</span>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={8}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-center text-lg"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Name *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Marketing strategist"
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Short description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="One line shown on the DAP card."
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">
          Custom instructions * (stacked on top of the base DAP AI prompt)
        </span>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          maxLength={4000}
          rows={6}
          placeholder="You are a senior B2B marketing strategist. Always ask about ICP and channel before drafting…"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">
          Opening message (optional)
        </span>
        <textarea
          value={opener}
          onChange={(e) => setOpener(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Hey — tell me what you're working on…"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create Custom AI"}
        </Button>
      </div>
    </form>
  );
}
