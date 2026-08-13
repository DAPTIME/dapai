import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Brain, Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import {
  addMemory,
  clearMemories,
  deleteMemory,
  listMemories,
  updateMemory,
} from "@/lib/memories.functions";

/**
 * Memory Vault — every fact DAP AI remembers about you, individually
 * editable, deletable and toggleable. Rows are private per account (RLS).
 */
export function MemoryVault() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useServerFn(listMemories);
  const add = useServerFn(addMemory);
  const patch = useServerFn(updateMemory);
  const remove = useServerFn(deleteMemory);
  const clearAll = useServerFn(clearMemories);

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const memsQuery = useQuery({
    queryKey: ["memories"],
    queryFn: () => list(),
    enabled: !!user,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["memories"] });
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Something went wrong");

  const addMut = useMutation({
    mutationFn: (content: string) => add({ data: { content } }),
    onSuccess: () => {
      setDraft("");
      invalidate();
    },
    onError: fail,
  });

  const patchMut = useMutation({
    mutationFn: (vars: { id: string; content?: string; enabled?: boolean }) =>
      patch({ data: vars }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: fail,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
    onError: fail,
  });

  const clearMut = useMutation({
    mutationFn: () => clearAll(),
    onSuccess: () => {
      toast.success("Memory Vault cleared");
      invalidate();
    },
    onError: fail,
  });

  const mems = memsQuery.data ?? [];
  const activeCount = mems.filter((m) => m.enabled).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Brain className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Label className="text-base">Memory Vault</Label>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {activeCount} active / {mems.length} stored
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything DAP AI remembers about you, in one place. Edit any fact,
            switch one off to keep it stored but unused, or delete it for good.
            These rows are private to your account and never shared.
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
            The vault is empty. Tell DAP AI things about yourself in chat and
            they'll show up here automatically.
          </p>
        )}

        {mems.map((m) => {
          const editing = editingId === m.id;
          return (
            <div
              key={m.id}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  {editing ? (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        value={editDraft}
                        maxLength={500}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editDraft.trim()) {
                            patchMut.mutate({
                              id: m.id,
                              content: editDraft.trim(),
                            });
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={!editDraft.trim() || patchMut.isPending}
                        onClick={() =>
                          patchMut.mutate({
                            id: m.id,
                            content: editDraft.trim(),
                          })
                        }
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span
                        className={
                          m.enabled
                            ? "text-sm"
                            : "text-sm text-muted-foreground line-through"
                        }
                      >
                        {m.content}
                      </span>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {m.source === "user" ? "Added by you" : "Learned in chat"}
                        {" · "}
                        {new Date(m.created_at).toLocaleDateString()}
                      </div>
                    </>
                  )}
                </div>

                {!editing && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={m.enabled}
                      aria-label="Use this memory"
                      onCheckedChange={(v) =>
                        patchMut.mutate({ id: m.id, enabled: v })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditDraft(m.content);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Edit memory"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => delMut.mutate(m.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete memory"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {mems.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Clear the whole Memory Vault? This can't be undone.")) {
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
