import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Cpu, Shield, Lock, MessageSquare, KeyRound, Pencil, Eye } from "lucide-react";
import {
  adminAmIAdmin,
  adminListUsers,
  adminUpdateUser,
  adminResetPassword,
  adminGetSystemPrompt,
  adminSetSystemPrompt,
  adminListAllChats,
  adminGetChat,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — DAP AI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const amIAdmin = useServerFn(adminAmIAdmin);
  const meQuery = useQuery({ queryKey: ["admin", "me"], queryFn: () => amIAdmin() });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Console</h1>
          <p className="text-sm text-muted-foreground">
            Manage users, the global system prompt, and read every chat.
          </p>
        </div>
      </header>

      {meQuery.isLoading ? (
        <div className="mt-12 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : !meQuery.data?.isAdmin ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Lock className="h-4 w-4" /> Restricted area
          </p>
          <p className="mt-1">
            This console is restricted to the site owner. Your account is not
            authorized.
          </p>
        </div>
      ) : (
        <Tabs defaultValue="users" className="mt-8">
          <TabsList>
            <TabsTrigger value="users">
              <Shield className="mr-2 h-4 w-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="prompt">
              <Cpu className="mr-2 h-4 w-4" /> System Prompt
            </TabsTrigger>
            <TabsTrigger value="chats">
              <MessageSquare className="mr-2 h-4 w-4" /> All Chats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="prompt" className="mt-6">
            <SystemPromptTab />
          </TabsContent>
          <TabsContent value="chats" className="mt-6">
            <ChatsTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  tier: "free" | "pro";
  pro_messages_used: number;
  created_at: string;
};

function UsersTab() {
  const qc = useQueryClient();
  const listUsers = useServerFn(adminListUsers);
  const updateUser = useServerFn(adminUpdateUser);
  const resetPassword = useServerFn(adminResetPassword);

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsers(),
  });

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [viewing, setViewing] = useState<AdminUser | null>(null);

  const setTier = useMutation({
    mutationFn: (vars: { userId: string; tier: "free" | "pro" }) =>
      updateUser({
        data: {
          userId: vars.userId,
          tier: vars.tier,
          resetUsage: vars.tier === "pro",
        },
      }),
    onSuccess: () => {
      toast.success("Tier updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const users = (usersQuery.data ?? []) as AdminUser[];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Edit any user's details, change their tier, or reset their password.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-2">User</th>
              <th className="px-2 py-2">Tier</th>
              <th className="px-2 py-2">Pro msgs</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
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
                <td className="px-2 py-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(u)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPwUser(u)}
                    >
                      <KeyRound className="mr-1 h-3.5 w-3.5" /> Password
                    </Button>
                    {u.tier === "free" ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          setTier.mutate({ userId: u.id, tier: "pro" })
                        }
                        style={{ background: "var(--gradient-brand)" }}
                      >
                        Make Pro
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTier.mutate({ userId: u.id, tier: "free" })
                        }
                      >
                        Make Free
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!usersQuery.isLoading && users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          try {
            await updateUser({ data: patch });
            toast.success("User updated");
            qc.invalidateQueries({ queryKey: ["admin", "users"] });
            setEditing(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        }}
      />

      <ResetPasswordDialog
        user={pwUser}
        onClose={() => setPwUser(null)}
        onSave={async (newPassword) => {
          try {
            await resetPassword({
              data: { userId: pwUser!.id, newPassword },
            });
            toast.success("Password reset");
            setPwUser(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        }}
      />
    </div>
  );
}

function EditUserDialog({
  user,
  onClose,
  onSave,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSave: (patch: {
    userId: string;
    name?: string;
    email?: string;
    tier?: "free" | "pro";
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setTier(user.tier);
    }
  }, [user]);

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tier</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={tier === "free" ? "default" : "outline"}
                onClick={() => setTier("free")}
              >
                Free
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tier === "pro" ? "default" : "outline"}
                onClick={() => setTier("pro")}
              >
                Pro
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || !user}
            onClick={async () => {
              if (!user) return;
              setSaving(true);
              const patch: {
                userId: string;
                name?: string;
                email?: string;
                tier?: "free" | "pro";
              } = { userId: user.id };
              if (name.trim() && name !== (user.name ?? ""))
                patch.name = name.trim();
              if (email.trim() && email !== (user.email ?? ""))
                patch.email = email.trim();
              if (tier !== user.tier) patch.tier = tier;
              await onSave(patch);
              setSaving(false);
            }}
            style={{ background: "var(--gradient-brand)" }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSave,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSave: (newPassword: string) => Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setPw("");
  }, [user]);

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Set a new password for{" "}
            <span className="font-medium text-foreground">
              {user?.email ?? user?.name}
            </span>
            . Existing passwords are one-way hashed and can't be viewed —
            only replaced.
          </p>
          <div className="space-y-2">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || pw.length < 6}
            onClick={async () => {
              setSaving(true);
              await onSave(pw);
              setSaving(false);
            }}
            style={{ background: "var(--gradient-brand)" }}
          >
            {saving ? "Saving…" : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SystemPromptTab() {
  const qc = useQueryClient();
  const getPrompt = useServerFn(adminGetSystemPrompt);
  const setPrompt = useServerFn(adminSetSystemPrompt);

  const promptQuery = useQuery({
    queryKey: ["admin", "system-prompt"],
    queryFn: () => getPrompt(),
  });

  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (promptQuery.data) setDraft(promptQuery.data.systemPrompt);
  }, [promptQuery.data]);

  const save = useMutation({
    mutationFn: () => setPrompt({ data: { systemPrompt: draft } }),
    onSuccess: () => {
      toast.success("System prompt saved");
      qc.invalidateQueries({ queryKey: ["admin", "system-prompt"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <div className="space-y-2">
        <Label htmlFor="sysprompt">System prompt (hidden from users)</Label>
        <textarea
          id="sysprompt"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          placeholder="You are DAP AI…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Stored on the server. Prepended to every chat as the{" "}
          <code>system</code> message. Other users cannot read it.
        </p>
      </div>
      <Button
        onClick={() => save.mutate()}
        disabled={save.isPending || promptQuery.isLoading}
        style={{ background: "var(--gradient-brand)" }}
      >
        {save.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function ChatsTab() {
  const listAll = useServerFn(adminListAllChats);
  const getOne = useServerFn(adminGetChat);

  const chatsQuery = useQuery({
    queryKey: ["admin", "all-chats"],
    queryFn: () => listAll(),
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["admin", "chat", openId],
    queryFn: () => getOne({ data: { chatId: openId! } }),
    enabled: !!openId,
  });

  const chats = chatsQuery.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">All chats</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every user's chats. Click one to read the conversation.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="max-h-[560px] overflow-y-auto rounded-md border border-border">
          {chats.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              {chatsQuery.isLoading ? "Loading…" : "No chats yet."}
            </div>
          )}
          {chats.map((c) => (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              className={`block w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-muted/40 ${
                openId === c.id ? "bg-muted/60" : ""
              }`}
            >
              <div className="truncate font-medium">{c.title}</div>
              <div className="text-xs text-muted-foreground">
                {c.user_name || c.user_email || c.user_id.slice(0, 8)} ·{" "}
                {new Date(c.updated_at).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
        <div className="max-h-[560px] overflow-y-auto rounded-md border border-border p-3">
          {!openId && (
            <p className="text-sm text-muted-foreground">
              Select a chat to view it.
            </p>
          )}
          {openId && detail.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {openId && detail.data && (
            <div className="space-y-3">
              {detail.data.messages.length === 0 && (
                <p className="text-sm text-muted-foreground">Empty chat.</p>
              )}
              {detail.data.messages.map((m) => (
                <div key={m.id} className="rounded-md border border-border p-2">
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {m.role}
                    {m.model ? ` · ${m.model}` : ""}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
