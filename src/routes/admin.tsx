import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Cpu, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { loadConfig, saveConfig, type AIConfig } from "@/lib/ai-config";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Console — DAP AI" }] }),
  component: Admin,
});

function Admin() {
  const [cfg, setCfg] = useState<AIConfig>(loadConfig);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  useEffect(() => setCfg(loadConfig()), []);

  const update = <K extends keyof AIConfig>(k: K, v: AIConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const onSave = () => {
    saveConfig(cfg);
    toast.success("Configuration saved");
  };

  const onTest = async () => {
    setStatus("testing");
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("ok");
      toast.success("Connected to your AI endpoint");
    } catch (e) {
      setStatus("fail");
      toast.error("Could not reach endpoint. Check URL/CORS.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Console</h1>
          <p className="text-sm text-muted-foreground">
            Connect your own AI — run on your PC's GPU via Ollama, LM Studio, or any OpenAI-compatible server.
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Use my own AI</Label>
            <p className="text-sm text-muted-foreground">
              Route chats to the endpoint below instead of the built-in mock.
            </p>
          </div>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => update("enabled", v)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="endpoint">Endpoint URL</Label>
          <Input
            id="endpoint"
            value={cfg.endpoint}
            onChange={(e) => update("endpoint", e.target.value)}
            placeholder="http://localhost:11434/v1/chat/completions"
          />
          <p className="text-xs text-muted-foreground">
            Ollama: <code>http://localhost:11434/v1/chat/completions</code> · LM Studio:{" "}
            <code>http://localhost:1234/v1/chat/completions</code>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={cfg.model}
              onChange={(e) => update("model", e.target.value)}
              placeholder="llama3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="key">API key (optional)</Label>
            <Input
              id="key"
              type="password"
              value={cfg.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="Leave blank for local"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button onClick={onSave} style={{ background: "var(--gradient-brand)" }}>
            Save
          </Button>
          <Button variant="outline" onClick={onTest} disabled={status === "testing"}>
            {status === "testing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test connection
          </Button>
          {status === "ok" && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Reachable
            </span>
          )}
          {status === "fail" && (
            <span className="inline-flex items-center gap-1 text-sm text-destructive">
              <XCircle className="h-4 w-4" /> Failed
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How this works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Install Ollama or LM Studio on your PC and start the local server.</li>
          <li>Pull a model (e.g. <code>ollama pull llama3</code>) — it will run on your GPU.</li>
          <li>Paste the endpoint above, save, and toggle "Use my own AI" on.</li>
          <li>Your chats will run locally on your hardware — no data leaves your machine.</li>
        </ol>
      </div>
    </div>
  );
}
