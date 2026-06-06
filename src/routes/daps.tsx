import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Plus, Trash2, X, Lock } from "lucide-react";
import { useState } from "react";
import { DAPS } from "@/lib/daps";
import { createChat } from "@/lib/chats.functions";
import {
  listCustomDaps,
  createCustomDap,
  deleteCustomDap,
} from "@/lib/custom-daps.functions";
import { getFeatureFlags } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/daps")({
  head: () => ({
    meta: [
      { title: "Custom AI Assistants — DAP AI" },
      {
        name: "description",
        content:
          "Explore DAP AI's custom AI assistants for coding, studying, writing, planning, and focused tasks.",
      },
      { property: "og:title", content: "Custom AI Assistants — DAP AI" },
      {
        property: "og:description",
        content:
          "Explore specialized DAP AI assistants for coding, studying, writing, planning, and focused tasks.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/daps" },
    ],
    links: [{ rel: "canonical", href: "https://dapai.lovable.app/daps" }],
  }),
  component: Daps,
});

function Daps() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const create = useServerFn(createChat);
  const listCustom = useServerFn(listCustomDaps);
  const createCustom = useServerFn(createCustomDap);
  const deleteCustom = useServerFn(deleteCustomDap);
  const fetchFlags = useServerFn(getFeatureFlags);
  const flagsQuery = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => fetchFlags(),
  });
  const dapsEnabled = flagsQuery.data?.daps !== false;

  const [showForm, setShowForm] = useState(false);

  const customQuery = useQuery({
    queryKey: ["custom-daps"],
    queryFn: () => listCustom(),
    enabled: !!user && dapsEnabled,
  });

  const startDap = useMutation({
    mutationFn: (dapId: string) => create({ data: { dapId } }),
    onSuccess: (chat) =>
      navigate({ to: "/c/$threadId", params: { threadId: chat.id } }),
    onError: (e: Error) =>
      toast.error(e?.message || "Couldn't start that DAP. Please try again."),
  });

  const removeCustom = useMutation({
    mutationFn: (id: string) => deleteCustom({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-daps"] });
      toast.success("Custom DAP deleted.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const launch = (id: string) => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    startDap.mutate(id);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">DAPs</h1>
          <p className="mt-2 text-muted-foreground">
            Specialized AI personas. Each DAP adds its own system prompt on top
            of the base DAP AI prompt.
          </p>
        </div>
        {user && (
          <Button onClick={() => setShowForm((s) => !s)} className="gap-2">
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "New custom DAP"}
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
              toast.success("Custom DAP created.");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}

      {user && customQuery.data && customQuery.data.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Your custom DAPs
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
                <button
                  onClick={() => {
                    if (confirm(`Delete "${c.name}"?`)) removeCustom.mutate(c.id);
                  }}
                  className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  aria-label="Delete custom DAP"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Built-in DAPs
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
          {busy ? "Creating…" : "Create DAP"}
        </Button>
      </div>
    </form>
  );
}
