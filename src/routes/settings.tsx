import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Brain, Moon, ShieldCheck, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { InstallAppButton } from "@/components/install-app-button";
import { MemoryVault } from "@/components/memory-vault";

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
