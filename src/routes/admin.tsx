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
import { Cpu, Shield, Lock, MessageSquare, KeyRound, Pencil, Eye, Users, Trash2, Plus, Power, MoreHorizontal, Crown, UserMinus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  adminAmIAdmin,
  adminListUsers,
  adminUpdateUser,
  adminResetPassword,
  
  adminDeleteUser,
  adminGetSystemPrompt,
  adminSetSystemPrompt,
  adminListAllChats,
  adminGetChat,
  getSiteStatus,
  adminSetSiteStatus,
  getFeatureFlags,
  adminSetFeatureFlag,
} from "@/lib/admin.functions";

const FEATURE_KEYS = ["pro_model", "lite_model", "daps", "team", "games"] as const;
type FeatureKey = (typeof FEATURE_KEYS)[number];
const FEATURE_LABELS: Record<FeatureKey, string> = {
  pro_model: "DAP AI 3.2 (Pro)",
  lite_model: "DAP AI Lite",
  daps: "Custom AI's",
  team: "Our Team page",
  games: "Games (DAP Arcade)",
};
const FEATURE_DESCRIPTIONS: Record<FeatureKey, string> = {
  pro_model: "Block sending messages with the DAP AI 3.2 Pro model.",
  lite_model: "Block sending messages with the DAP AI Lite model.",
  daps: "Hide the /daps page and disable starting Custom AI chats.",
  team: "Hide the /team page.",
  games: "Hide the arcade: the sidebar link, /games and every game inside it.",
};

import {
  listBetaTesters,
  adminAddBetaTester,
  adminRemoveBetaTester,
} from "@/lib/beta.functions";

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
            <TabsTrigger value="beta">
              <Users className="mr-2 h-4 w-4" /> Beta Testers
            </TabsTrigger>
            <TabsTrigger value="features">
              <Power className="mr-2 h-4 w-4" /> Site & Features
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
          <TabsContent value="beta" className="mt-6">
            <BetaTab />
          </TabsContent>
          <TabsContent value="features" className="mt-6 space-y-6">
            <SiteTab />
            <FeaturesTab />
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
  
  const deleteUser = useServerFn(adminDeleteUser);

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




  const deleteUserMut = useMutation({
    mutationFn: (userId: string) => deleteUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("Account deleted.");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const users = (usersQuery.data ?? []) as AdminUser[];
  const [query, setQuery] = useState("");

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  });

  const proCount = users.filter((u) => u.tier === "pro").length;
  const initials = (u: AdminUser) => {
    const src = (u.name || u.email || "?").trim();
    const parts = src.split(/\s+/);
    const a = parts[0]?.[0] ?? "?";
    const b = parts[1]?.[0] ?? src[1] ?? "";
    return (a + b).toUpperCase();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            {users.length} total · {proCount} Pro · {users.length - proCount} Free
          </p>
        </div>
        <div className="sm:w-72">
          <Input
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {usersQuery.isLoading && (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </li>
          )}
          {!usersQuery.isLoading && filtered.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              {users.length === 0 ? "No users yet." : "No users match that search."}
            </li>
          )}
          {filtered.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/30"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground"
                style={{ background: "var(--gradient-brand)" }}
              >
                {initials(u)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{u.name || "Unnamed"}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      u.tier === "pro"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {u.tier}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.email ?? "—"}
                </div>
              </div>
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <div className="font-medium text-foreground">{u.pro_messages_used}</div>
                <div>Pro msgs</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => setViewing(u)}>
                    <Eye className="mr-2 h-4 w-4" /> View profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditing(u)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPwUser(u)}>
                    <KeyRound className="mr-2 h-4 w-4" /> Reset password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {u.tier === "free" ? (
                    <DropdownMenuItem
                      onSelect={() => setTier.mutate({ userId: u.id, tier: "pro" })}
                    >
                      <Crown className="mr-2 h-4 w-4" /> Make Pro
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() => setTier.mutate({ userId: u.id, tier: "free" })}
                    >
                      <UserMinus className="mr-2 h-4 w-4" /> Downgrade to Free
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => {
                      if (
                        confirm(
                          `Delete ${u.email || "this user"}? They'll be able to sign up again with the same email.`
                        )
                      ) {
                        deleteUserMut.mutate(u.id);
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
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

      <ViewProfileDialog user={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}


function ViewProfileDialog({
  user,
  onClose,
}: {
  user: AdminUser | null;
  onClose: () => void;
}) {
  const rows: { label: string; value: string }[] = user
    ? [
        { label: "Name", value: user.name ?? "—" },
        { label: "Email", value: user.email ?? "—" },
        { label: "User ID", value: user.id },
        { label: "Tier", value: user.tier },
        { label: "Pro messages used", value: String(user.pro_messages_used) },
        { label: "Created", value: new Date(user.created_at).toLocaleString() },
      ]
    : [];

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-b-0"
            >
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {r.label}
              </span>
              <span className="break-all font-medium">{r.value}</span>
            </div>
          ))}
          <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Password:</span>{" "}
            Passwords are one-way hashed by the auth system and cannot be viewed
            by anyone — not even you. Use the “Password” button to set a new one.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
              type="password"
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
  return (
    <div className="space-y-6">
      <SystemPromptEditor
        model="dap-ai-1.0"
        title="DAP AI 3.2 (Pro)"
        description="Used when the Pro model is selected. Falls back to the legacy global prompt if left empty."
      />
      <SystemPromptEditor
        model="dap-ai-lite"
        title="DAP AI Lite"
        description="Used when the Lite model is selected. Falls back to the legacy global prompt if left empty."
      />
    </div>
  );
}

function SystemPromptEditor({
  model,
  title,
  description,
}: {
  model: "dap-ai-1.0" | "dap-ai-lite";
  title: string;
  description: string;
}) {
  const qc = useQueryClient();
  const getPrompt = useServerFn(adminGetSystemPrompt);
  const setPrompt = useServerFn(adminSetSystemPrompt);

  const promptQuery = useQuery({
    queryKey: ["admin", "system-prompt", model],
    queryFn: () => getPrompt({ data: { model } }),
  });

  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (promptQuery.data) setDraft(promptQuery.data.systemPrompt);
  }, [promptQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      setPrompt({ data: { model, systemPrompt: draft } }),
    onSuccess: () => {
      toast.success(`${title} prompt saved`);
      qc.invalidateQueries({ queryKey: ["admin", "system-prompt", model] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`sysprompt-${model}`} className="text-base font-semibold">
            {title}
          </Label>
          <code className="text-xs text-muted-foreground">{model}</code>
        </div>
        <textarea
          id={`sysprompt-${model}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          placeholder="You are DAP AI…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{description}</p>
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
      {chatsQuery.error && (
        <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          Failed to load chats: {(chatsQuery.error as Error).message}
        </div>
      )}
      <div className="mt-4 max-h-[560px] overflow-y-auto rounded-md border border-border">
        {chats.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            {chatsQuery.isLoading ? "Loading…" : "No chats yet."}
          </div>
        )}
        {chats.map((c) => (
          <button
            key={c.id}
            onClick={() => setOpenId(c.id)}
            className="block w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-muted/40"
          >
            <div className="truncate font-medium">{c.title}</div>
            <div className="text-xs text-muted-foreground">
              {c.user_name || c.user_email || c.user_id.slice(0, 8)} ·{" "}
              {new Date(c.updated_at).toLocaleString()}
            </div>
          </button>
        ))}
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chat conversation</DialogTitle>
          </DialogHeader>
          {detail.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {detail.error && (
            <p className="text-sm text-destructive">
              Failed to load chat: {(detail.error as Error).message}
            </p>
          )}
          {detail.data && (
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
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BetaTab() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listBetaTesters);
  const addFn = useServerFn(adminAddBetaTester);
  const removeFn = useServerFn(adminRemoveBetaTester);
  const [name, setName] = useState("");

  const listQuery = useQuery({
    queryKey: ["beta-testers"],
    queryFn: () => fetchList(),
  });

  const add = useMutation({
    mutationFn: (n: string) => addFn({ data: { name: n } }),
    onSuccess: () => {
      toast.success("Beta tester added");
      setName("");
      qc.invalidateQueries({ queryKey: ["beta-testers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["beta-testers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const list = listQuery.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Beta Testers</h2>
        <p className="text-sm text-muted-foreground">
          Add or remove names shown on the public Team page.
        </p>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          add.mutate(trimmed);
        }}
      >
        <Input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
        <Button type="submit" disabled={add.isPending || !name.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </form>

      <ul className="mt-5 divide-y divide-border rounded-md border border-border">
        {listQuery.isLoading && (
          <li className="px-3 py-3 text-sm text-muted-foreground">Loading…</li>
        )}
        {!listQuery.isLoading && list.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted-foreground">
            No beta testers yet.
          </li>
        )}
        {list.map((b) => (
          <li
            key={b.id}
            className="flex items-center justify-between px-3 py-2 text-sm"
          >
            <span className="font-medium">{b.name}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => remove.mutate(b.id)}
              disabled={remove.isPending}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SiteTab() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getSiteStatus);
  const setStatus = useServerFn(adminSetSiteStatus);

  const statusQuery = useQuery({
    queryKey: ["site-status"],
    queryFn: () => fetchStatus(),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setStatus({ data: { enabled } }),
    onSuccess: (_d, enabled) => {
      toast.success(enabled ? "Site enabled" : "Site disabled");
      qc.invalidateQueries({ queryKey: ["site-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const enabled = statusQuery.data?.enabled ?? true;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Site availability</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        When disabled, the chat composer is hidden everywhere and visitors see
        a maintenance message. New chats cannot be sent.
      </p>

      <div className="mt-5 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-4">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${
            enabled ? "bg-emerald-500" : "bg-destructive"
          }`}
        />
        <span className="text-sm font-medium">
          {statusQuery.isLoading
            ? "Loading…"
            : enabled
              ? "DAP AI is live"
              : "DAP AI is OFF — maintenance mode"}
        </span>
        <div className="ml-auto">
          <Button
            onClick={() => toggle.mutate(!enabled)}
            disabled={statusQuery.isLoading || toggle.isPending}
            variant={enabled ? "outline" : "default"}
            style={!enabled ? { background: "var(--gradient-brand)" } : undefined}
          >
            <Power className="mr-2 h-4 w-4" />
            {enabled ? "Turn OFF" : "Turn ON"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeaturesTab() {
  const qc = useQueryClient();
  const fetchFlags = useServerFn(getFeatureFlags);
  const setFlag = useServerFn(adminSetFeatureFlag);

  const flagsQuery = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => fetchFlags(),
  });

  const toggle = useMutation({
    mutationFn: (v: { key: FeatureKey; enabled: boolean }) =>
      setFlag({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(
        `${FEATURE_LABELS[v.key]} ${v.enabled ? "enabled" : "disabled"}`
      );
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const flags = flagsQuery.data;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Features & models</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Turn individual models, pages, or features on or off for everyone.
      </p>

      <ul className="mt-5 divide-y divide-border">
        {FEATURE_KEYS.map((key) => {
          const enabled = flags ? flags[key] : true;
          return (
            <li
              key={key}
              className="flex items-center gap-4 py-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-2.5 w-2.5 rounded-full ${
                      enabled ? "bg-emerald-500" : "bg-destructive"
                    }`}
                  />
                  <span className="font-medium">{FEATURE_LABELS[key]}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {FEATURE_DESCRIPTIONS[key]}
                </p>
              </div>
              <Button
                onClick={() => toggle.mutate({ key, enabled: !enabled })}
                disabled={flagsQuery.isLoading || toggle.isPending}
                variant={enabled ? "outline" : "default"}
                style={
                  !enabled ? { background: "var(--gradient-brand)" } : undefined
                }
              >
                <Power className="mr-2 h-4 w-4" />
                {enabled ? "Turn OFF" : "Turn ON"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
