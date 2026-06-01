import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Cpu, Shield } from "lucide-react";
import { loadConfig, saveConfig, type AIConfig } from "@/lib/ai-config";
import { useAuth } from "@/lib/auth";
import {
  adminAmIAdmin,
  adminListUsers,
  adminSetTier,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Console — DAP AI" }] }),
  component: Admin,
});

function Admin() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<AIConfig>(loadConfig);
  useEffect(() => setCfg(loadConfig()), []);

  const onSave = () => {
    saveConfig(cfg);
    toast.success("System prompt saved");
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin Console
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure the AI's system prompt and (if you're an admin) manage user tiers.
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="sysprompt">System prompt</Label>
          <textarea
            id="sysprompt"
            value={cfg.systemPrompt}
            onChange={(e) =>
              setCfg((c) => ({ ...c, systemPrompt: e.target.value }))
            }
            rows={5}
            placeholder="You are DAP AI…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Sent as the <code>system</code> message at the start of every conversation.
          </p>
        </div>
        <Button onClick={onSave} style={{ background: "var(--gradient-brand)" }}>
          Save
        </Button>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Point the relay at your PC by setting the{" "}
        <code>AI_BACKEND_URL</code> secret to your tunnel
        (LM Studio / Ollama). The site forwards every chat through{" "}
        <code>/api/chat</code> to that URL.
      </div>

      {user && <AdminUserManager />}
    </div>
  );
}

function AdminUserManager() {
  const qc = useQueryClient();
  const amIAdmin = useServerFn(adminAmIAdmin);
  const listUsers = useServerFn(adminListUsers);
  const setTier = useServerFn(adminSetTier);

  const meQuery = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => amIAdmin(),
  });

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsers(),
    enabled: meQuery.data?.isAdmin === true,
  });

  const mutate = useMutation({
    mutationFn: (vars: { userId: string; tier: "free" | "pro" }) =>
      setTier({
        data: { userId: vars.userId, tier: vars.tier, resetUsage: vars.tier === "pro" },
      }),
    onSuccess: () => {
      toast.success("Tier updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (meQuery.isLoading) return null;
  if (!meQuery.data?.isAdmin) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Shield className="h-4 w-4" /> Admin-only section
        </p>
        <p className="mt-1">
          You're signed in but don't have the admin role. To grant yourself
          admin access, open the backend SQL editor and run:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 text-xs">
{`INSERT INTO public.user_roles (user_id, role)
VALUES ('${"<your-user-id>"}', 'admin');`}
        </pre>
      </div>
    );
  }

  const users = usersQuery.data ?? [];

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <h2 className="text-lg font-semibold">User tiers</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Move people between free and pro. Free tier gets 5 DAP AI 3.2 messages, then Lite.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-2">User</th>
              <th className="px-2 py-2">Tier</th>
              <th className="px-2 py-2">Pro msgs used</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-2 py-2">
                  <div className="font-medium">{u.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.tier === "pro"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {u.tier}
                  </span>
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {u.pro_messages_used}
                </td>
                <td className="px-2 py-2 text-right">
                  {u.tier === "free" ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        mutate.mutate({ userId: u.id, tier: "pro" })
                      }
                      style={{ background: "var(--gradient-brand)" }}
                    >
                      Promote to Pro
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        mutate.mutate({ userId: u.id, tier: "free" })
                      }
                    >
                      Move to Free
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
