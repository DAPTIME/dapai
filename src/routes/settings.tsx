import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Brain, Plus, Trash2, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  listMemories,
  addMemory,
  deleteMemory,
  clearMemories,
} from "@/lib/memories.functions";
import { useAuth } from "@/lib/auth";
import { useUpgradeGate } from "@/lib/tier-gate";

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

function useLocalToggle(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(key);
    if (raw === "1") setValue(true);
    else if (raw === "0") setValue(false);
    else setValue(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = (v: boolean) => {
    setValue(v);
    if (typeof window !== "undefined") {
      localStorage.setItem(key, v ? "1" : "0");
      window.dispatchEvent(new CustomEvent("dap.setting", { detail: { key, value: v } }));
    }
  };
  return [value, update] as const;
}

function Settings() {
  const [history, setHistory] = useLocalToggle("dap.history", true);
  const [sounds, setSounds] = useLocalToggle("dap.sounds", false);
  const [beta, setBetaRaw] = useLocalToggle("dap.beta", false);
  const { hasTier, requireTier } = useUpgradeGate();
  const canBeta = hasTier("go");
  // Beta features are Pro and up; anyone lower gets the upgrade screen.
  const setBeta = (v: boolean) => {
    if (v && !requireTier("go", "Beta features")) return;
    setBetaRaw(v);
  };
  useEffect(() => {
    if (!canBeta && beta) setBetaRaw(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBeta, beta]);
  const [glass, setGlassRaw] = useLocalToggle("dap.glass", false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("liquid-glass", glass);
    }
  }, [glass]);

  const rows = [
    { id: "history", label: "Save chat history", desc: "Keep recent conversations in the sidebar.", checked: history, onChange: setHistory },
    { id: "sounds", label: "Sound effects", desc: "Play subtle sounds on send/receive.", checked: sounds, onChange: setSounds },
    { id: "glass", label: "Liquid Glass", desc: "Frosted, translucent surfaces across the app.", checked: glass, onChange: setGlassRaw },
    { id: "beta", label: "Beta features", desc: canBeta ? "Try experimental tools early, including AI Memory." : "Go plan and up. Try experimental tools early, including AI Memory.", checked: beta && canBeta, onChange: setBeta },
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-8 space-y-6">
        <div className="flex items-start justify-between rounded-2xl border border-border bg-card p-5">
          <div>
            <Label className="text-base">Install DAP AI</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Add DAP AI to your device as an app. If you've already installed
              it, or your browser doesn't support it, nothing shows here.
            </p>
          </div>
          <InstallAppButton variant="outline" />
        </div>
        <ThemeRow />
        {rows.map((row) => (

          <div key={row.id} className="flex items-start justify-between rounded-2xl border border-border bg-card p-5">
            <div>
              <Label htmlFor={row.id} className="text-base">{row.label}</Label>
              <p className="mt-1 text-sm text-muted-foreground">{row.desc}</p>
            </div>
            <Switch
              id={row.id}
              checked={row.checked}
              onCheckedChange={row.onChange}
            />
          </div>
        ))}

        {beta && canBeta ? (
          <MemorySection />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Brain className="h-4 w-4" /> AI Memory
            </div>
            <p className="mt-1">Enable Beta features above to try AI Memory.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MemorySection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useServerFn(listMemories);
  const add = useServerFn(addMemory);
  const remove = useServerFn(deleteMemory);
  const clearAll = useServerFn(clearMemories);

  const [draft, setDraft] = useState("");

  const memsQuery = useQuery({
    queryKey: ["memories"],
    queryFn: () => list(),
    enabled: !!user,
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

function ThemeRow() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-start justify-between rounded-2xl border border-border bg-card p-5">
      <div>
        <Label className="text-base">Appearance</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose dark or light mode. Defaults to dark.
        </p>
      </div>
      <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
        <Button
          type="button"
          size="sm"
          variant={theme === "dark" ? "default" : "ghost"}
          onClick={() => setTheme("dark")}
          className="h-8 gap-1.5 rounded-full px-3"
          aria-pressed={theme === "dark"}
        >
          <Moon className="h-4 w-4" />
          Dark
        </Button>
        <Button
          type="button"
          size="sm"
          variant={theme === "light" ? "default" : "ghost"}
          onClick={() => setTheme("light")}
          className="h-8 gap-1.5 rounded-full px-3"
          aria-pressed={theme === "light"}
        >
          <Sun className="h-4 w-4" />
          Light
        </Button>
      </div>
    </div>
  );
}
