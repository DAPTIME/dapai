import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Brain, Plus, Trash2 } from "lucide-react";
import {
  listMemories,
  addMemory,
  deleteMemory,
  clearMemories,
} from "@/lib/memories.functions";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — DAP AI" },
      {
        name: "description",
        content:
          "Manage your DAP AI account preferences: chat history, sound effects, beta features, and AI memory.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Settings,
});

function Settings() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-8 space-y-6">
        {[
          { id: "history", label: "Save chat history", desc: "Keep recent conversations in the sidebar." },
          { id: "sounds", label: "Sound effects", desc: "Play subtle sounds on send/receive." },
          { id: "beta", label: "Beta features", desc: "Try experimental tools early." },
        ].map((row) => (
          <div key={row.id} className="flex items-start justify-between rounded-2xl border border-border bg-card p-5">
            <div>
              <Label htmlFor={row.id} className="text-base">{row.label}</Label>
              <p className="mt-1 text-sm text-muted-foreground">{row.desc}</p>
            </div>
            <Switch id={row.id} defaultChecked={row.id === "history"} />
          </div>
        ))}

        <MemorySection />
      </div>
    </div>
  );
}

function MemorySection() {
  const qc = useQueryClient();
  const list = useServerFn(listMemories);
  const add = useServerFn(addMemory);
  const remove = useServerFn(deleteMemory);
  const clearAll = useServerFn(clearMemories);

  const [draft, setDraft] = useState("");

  const memsQuery = useQuery({
    queryKey: ["memories"],
    queryFn: () => list(),
  });

  const addMut = useMutation({
    mutationFn: (content: string) => add({ data: { content } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memories"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const clearMut = useMutation({
    mutationFn: () => clearAll(),
    onSuccess: () => {
      toast.success("Memory cleared");
      qc.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const mems = memsQuery.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Brain className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <Label className="text-base">AI memory</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            DAP AI remembers facts about you across chats (like your name,
            preferences, or ongoing projects). New memories are picked up
            automatically as you chat. You can add or remove them anytime.
          </p>
        </div>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (!v) return;
          addMut.mutate(v);
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a memory (e.g. I prefer short answers)"
          maxLength={500}
        />
        <Button
          type="submit"
          disabled={addMut.isPending || !draft.trim()}
          style={{ background: "var(--gradient-brand)" }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </form>

      <div className="mt-4 space-y-2">
        {memsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!memsQuery.isLoading && mems.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No memories yet. Tell DAP AI things about yourself in chat and
            they'll show up here.
          </p>
        )}
        {mems.map((m) => (
          <div
            key={m.id}
            className="flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
          >
            <span className="text-sm">{m.content}</span>
            <button
              type="button"
              onClick={() => delMut.mutate(m.id)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete memory"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {mems.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Clear all memories? This can't be undone.")) {
                clearMut.mutate();
              }
            }}
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
