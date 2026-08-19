import { createFileRoute, Link } from "@tanstack/react-router";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { sendChatMessage } from "@/lib/chats.functions";
import { Cpu, Shield, Lock, MessageSquare, KeyRound, Pencil, Eye, Trash2, Plus, Power, MoreHorizontal, Crown, Ban, Check, Gamepad2, Sparkles, Globe, EyeOff } from "lucide-react";
import { TIER_LABEL } from "@/lib/tier-gate";
import {
  adminListModels,
  adminSaveModel,
  adminDeleteModel,
  adminReorderModels,
  type StoredModel,
} from "@/lib/models.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  adminAmIAdmin,
  adminListUsers,
  adminUpdateUser,
  adminResetPassword,
  adminSetBan,
  adminDeleteUser,
  adminListAllChats,
  adminDeleteChat,
  adminGetChat,
  getSiteStatus,
  adminSetSiteStatus,
  getOfflineMessage,
  adminSetOfflineMessage,
  getFeatureFlags,
  adminSetFeatureFlag,
} from "@/lib/admin.functions";


import {
  FEATURE_GROUPS,
  FEATURE_LABELS,
  type FeatureKey,
} from "@/lib/admin-config";

const FEATURE_DESCRIPTIONS: Partial<Record<FeatureKey, string>> = {
  pro_model: "Block sending messages with the DAP AI 4 Pro model.",
  pro_lite_model: "Block sending messages with the DAP AI 4 Pro Lite model.",
  lite_model: "Block sending messages with the DAP AI 4 Lite model.",
  daps: "Hide the /daps page and disable starting Custom AI chats.",
  games: "Hide the whole arcade: the sidebar link, /games and every game.",
};

/** The console's sections, in the order they appear. */
const SECTIONS = [
  { id: "users", label: "Users", icon: Shield },
  { id: "chats", label: "All Chats", icon: MessageSquare },
  { id: "models", label: "Models", icon: Cpu },
  { id: "pages", label: "Pages", icon: Eye },
  { id: "arcade", label: "Arcade", icon: Gamepad2 },
  { id: "rooms", label: "Study Rooms", icon: Gamepad2 },
  { id: "daps", label: "DAP Review", icon: Sparkles },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];


import {
  adminListStudyRooms,
  adminDeleteStudyRoom,
  adminRestoreStudyRoom,
} from "@/lib/study-rooms.functions";
import {
  adminListDapSubmissions,
  adminReviewDap,
} from "@/lib/custom-daps.functions";
import {
  SITE_STATUSES,
  SITE_STATUS_LABELS,
  SITE_STATUS_DESCRIPTIONS,
  type SiteStatus,
} from "@/lib/site-status";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — DAP AI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Admin,
});

/**
 * What to tell the owner when the admin check could not be answered. The
 * three failures need three different fixes, and "something went wrong" sends
 * you looking in the wrong place.
 */
function checkFailureMessage(query: {
  isError: boolean;
  error: unknown;
  data?: { problem?: string; detail?: string };
}) {
  if (query.data?.problem === "config") {
    return `The server is missing ${query.data.detail ?? "a Supabase environment variable"}, so it could not look up your role. Set it in the deployment's environment variables — it is in the Supabase dashboard under Project Settings → API → service_role.`;
  }
  if (query.data?.problem === "database") {
    return `The database refused the role lookup${
      query.data.detail && query.data.detail !== "unreachable"
        ? ` (Postgres ${query.data.detail})`
        : ""
    }. The server log has the full error.`;
  }
  const message = query.error instanceof Error ? query.error.message : "";
  if (message.includes("Unauthorized")) {
    return "Your session was not accepted, so the console stayed closed. Signing out and back in usually fixes this.";
  }
  return "The server could not verify your account, so the console stayed closed. This is a server problem, not a permission one.";
}

function Admin() {
  const { user, ready } = useAuth();
  const [section, setSection] = useState<SectionId>("users");
  const amIAdmin = useServerFn(adminAmIAdmin);
  // Waiting for the session before asking: without a token the server
  // function throws Unauthorized, which would render as a server error on
  // every hard refresh of this page.
  const meQuery = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => amIAdmin(),
    enabled: !!user,
    retry: false,
  });

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
            Manage users, review Custom DAPs, and read every chat.
          </p>
        </div>
      </header>

      {!ready || meQuery.isLoading ? (
        <div className="mt-12 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : meQuery.isError || meQuery.data?.problem ? (
        // The check itself failed, so we genuinely do not know whether this
        // account is an admin. Saying "not authorized" here would blame the
        // visitor for a server problem.
        <div className="mt-10 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Lock className="h-4 w-4" /> Couldn't check your access
          </p>
          <p className="mt-1">{checkFailureMessage(meQuery)}</p>
          <p className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => meQuery.refetch()}
              disabled={meQuery.isFetching}
            >
              {meQuery.isFetching ? "Checking…" : "Try again"}
            </Button>
          </p>
        </div>
      ) : !meQuery.data?.isAdmin ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Lock className="h-4 w-4" /> Owner only
          </p>
          <p className="mt-1">
            Sorry — this console is reserved only for the site's owner.
          </p>
          {!user ? (
            <p className="mt-1">You are not signed in on this device.</p>
          ) : (
            <p className="mt-1">Signed in as {user.email}.</p>
          )}
        </div>
      ) : (
        <Tabs
          value={section}
          onValueChange={(v) => setSection(v as SectionId)}
          className="mt-8"
        >
          {/* A phone can't hold seven tabs, so it gets a picker instead. */}
          <div className="md:hidden">
            <Label htmlFor="admin-section" className="text-xs text-muted-foreground">
              Section
            </Label>
            <select
              id="admin-section"
              value={section}
              onChange={(e) => setSection(e.target.value as SectionId)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              {SECTIONS.map((sec) => (
                <option key={sec.id} value={sec.id}>{sec.label}</option>
              ))}
            </select>
          </div>
          <TabsList className="hidden md:inline-flex">
            {SECTIONS.map((sec) => (
              <TabsTrigger key={sec.id} value={sec.id}>
                <sec.icon className="mr-2 h-4 w-4" /> {sec.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="chats" className="mt-6">
            <ChatsTab />
          </TabsContent>
          <TabsContent value="models" className="mt-6 space-y-6">
            <SiteTab />
            <FeatureList
              title="Models"
              description="Turn an individual DAP AI model off for everyone."
              keys={FEATURE_GROUPS.models}
            />
            <ModelManager />
          </TabsContent>
          <TabsContent value="rooms" className="mt-6">
            <StudyRoomsTab />
          </TabsContent>
          <TabsContent value="daps" className="mt-6">
            <DapReviewTab />
          </TabsContent>
          <TabsContent value="pages" className="mt-6">
            <FeatureList
              title="Pages & features"
              description="Anyone using a page you turn off is sent back to the home page."
              keys={FEATURE_GROUPS.pages}
            />
          </TabsContent>
          <TabsContent value="arcade" className="mt-6">
            <FeatureList
              title="Arcade games"
              description="Turn an individual game off — it greys out in the arcade and anyone playing it is sent home."
              keys={FEATURE_GROUPS.games}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type TierId = "free" | "go" | "pro" | "exclusive";

const TIER_IDS: TierId[] = ["free", "go", "pro", "exclusive"];
const TIER_NAMES: Record<TierId, string> = {
  free: "Free",
  go: "Go",
  pro: "Pro",
  exclusive: "Exclusive",
};

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  tier: TierId;
  pro_messages_used: number;
  created_at: string;
  banned?: boolean;
  emailConfirmed?: boolean;
};

function TierBadge({ tier }: { tier: TierId }) {
  const styles: Record<TierId, string> = {
    free: "bg-muted text-muted-foreground",
    go: "bg-sky-500/15 text-sky-500",
    pro: "bg-primary/15 text-primary",
    exclusive: "bg-amber-500/15 text-amber-500",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[tier]}`}
    >
      {TIER_NAMES[tier]}
    </span>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const listUsers = useServerFn(adminListUsers);
  const updateUser = useServerFn(adminUpdateUser);
  const resetPassword = useServerFn(adminResetPassword);
  const setBan = useServerFn(adminSetBan);
  const deleteUser = useServerFn(adminDeleteUser);

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsers(),
  });

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [viewing, setViewing] = useState<AdminUser | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "users"] });
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Failed");

  const setTier = useMutation({
    mutationFn: (vars: { userId: string; tier: TierId }) =>
      updateUser({
        data: {
          userId: vars.userId,
          tier: vars.tier,
          resetUsage: vars.tier !== "free",
        },
      }),
    onSuccess: (_d, vars) => {
      toast.success(`Plan changed to ${TIER_NAMES[vars.tier]}`);
      invalidate();
    },
    onError: fail,
  });

  const banMut = useMutation({
    mutationFn: (vars: { userId: string; banned: boolean }) =>
      setBan({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success(vars.banned ? "User banned" : "User unbanned");
      invalidate();
    },
    onError: fail,
  });

  const deleteUserMut = useMutation({
    mutationFn: (userId: string) => deleteUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("Account deleted.");
      invalidate();
    },
    onError: fail,
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

  const counts = TIER_IDS.map((t) => ({
    tier: t,
    n: users.filter((u) => u.tier === t).length,
  }));

  const initials = (u: AdminUser) => {
    const src = (u.name || u.email || "?").trim();
    const parts = src.split(/\s+/);
    const a = parts[0]?.[0] ?? "?";
    const b = parts[1]?.[0] ?? src[1] ?? "";
    return (a + b).toUpperCase();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Users</h2>
            <p className="text-sm text-muted-foreground">
              {users.length} accounts
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
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counts.map((c) => (
            <div
              key={c.tier}
              className="rounded-xl border border-border bg-muted/30 px-4 py-3"
            >
              <div className="text-xl font-semibold">{c.n}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {TIER_NAMES[c.tier]}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
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
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground ${
                  u.banned ? "opacity-40 grayscale" : ""
                }`}
                style={{ background: "var(--gradient-brand)" }}
              >
                {initials(u)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{u.name || "Unnamed"}</span>
                  <TierBadge tier={u.tier} />
                  {u.banned && (
                    <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                      Banned
                    </span>
                  )}
                  {u.emailConfirmed === false && (
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                      Unconfirmed
                    </span>
                  )}
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
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setViewing(u)}>
                    <Eye className="mr-2 h-4 w-4" /> View profile
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Pencil className="mr-2 h-4 w-4" /> Edit details
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onSelect={() => setEditing(u)}>
                        <Pencil className="mr-2 h-4 w-4" /> Name & email
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPwUser(u)}>
                        <KeyRound className="mr-2 h-4 w-4" /> Change password
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Crown className="mr-2 h-4 w-4" /> Change plan
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {TIER_IDS.map((t) => (
                        <DropdownMenuItem
                          key={t}
                          disabled={u.tier === t || setTier.isPending}
                          onSelect={() => setTier.mutate({ userId: u.id, tier: t })}
                        >
                          {u.tier === t ? (
                            <Check className="mr-2 h-4 w-4 text-primary" />
                          ) : (
                            <span className="mr-2 h-4 w-4" />
                          )}
                          {TIER_NAMES[t]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      banMut.mutate({ userId: u.id, banned: !u.banned })
                    }
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    {u.banned ? "Unban user" : "Ban user"}
                  </DropdownMenuItem>
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
            invalidate();
            setEditing(null);
          } catch (e) {
            fail(e);
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
            fail(e);
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
    tier?: TierId;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<TierId>("free");

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
            <Label>Plan</Label>
            <div className="flex flex-wrap gap-2">
              {TIER_IDS.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={tier === t ? "default" : "outline"}
                  onClick={() => setTier(t)}
                >
                  {TIER_NAMES[t]}
                </Button>
              ))}
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
                tier?: TierId;
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
            disabled={saving || pw.length < 8}
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

function ChatsTab() {
  const qc = useQueryClient();
  const listAll = useServerFn(adminListAllChats);
  const getOne = useServerFn(adminGetChat);
  const removeChat = useServerFn(adminDeleteChat);
  const send = useServerFn(sendChatMessage);

  const chatsQuery = useQuery({
    queryKey: ["admin", "all-chats"],
    queryFn: () => listAll(),
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const detail = useQuery({
    queryKey: ["admin", "chat", openId],
    queryFn: () => getOne({ data: { chatId: openId! } }),
    enabled: !!openId,
  });

  const del = useMutation({
    mutationFn: (id: string) => removeChat({ data: { chatId: id } }),
    onSuccess: () => {
      toast.success("Chat deleted");
      setOpenId(null);
      qc.invalidateQueries({ queryKey: ["admin", "all-chats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reply = useMutation({
    mutationFn: (text: string) =>
      send({ data: { chatId: openId!, text, model: "dap-ai-lite" } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["admin", "chat", openId] });
      qc.invalidateQueries({ queryKey: ["admin", "all-chats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chats = chatsQuery.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">All chats</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every user's chats. Open one to read it, see the sender's IP per
        message, reply inside it, or delete it.
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
          <div
            key={c.id}
            className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm hover:bg-muted/40"
          >
            <button
              onClick={() => setOpenId(c.id)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{c.title}</span>
                {/* Kept after the owner deleted it — they cannot see it any
                    more, so the console has to say which state it is in. */}
                {c.deleted_at && (
                  <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                    Deleted
                  </span>
                )}
                {c.is_incognito && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Incognito
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.user_name || c.user_email || c.user_id.slice(0, 8)} ·{" "}
                {new Date(c.updated_at).toLocaleString()}
                {c.deleted_at &&
                  ` · deleted ${new Date(c.deleted_at).toLocaleString()}`}
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              aria-label="Delete chat"
              disabled={del.isPending}
              onClick={() => {
                if (
                  confirm(
                    "Permanently delete this chat and all of its messages? This removes it from the database for good — a user's own delete only hides it."
                  )
                ) {
                  del.mutate(c.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setDraft("");
          }
        }}
      >
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
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <span>{m.role}</span>
                    {m.model ? <span>· {m.model}</span> : null}
                    <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] normal-case">
                      IP: {m.ip ?? "unknown"}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              ))}

              <div className="flex items-end gap-2 border-t border-border pt-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply in this chat as the user…"
                  rows={2}
                  className="flex-1 resize-none rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <Button
                  disabled={!draft.trim() || reply.isPending}
                  onClick={() => reply.mutate(draft.trim())}
                >
                  {reply.isPending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
    mutationFn: (status: SiteStatus) => setStatus({ data: { status } }),
    onSuccess: (_d, status) => {
      toast.success(`Site set to ${SITE_STATUS_LABELS[status]}`);
      qc.invalidateQueries({ queryKey: ["site-status"] });
      qc.invalidateQueries({ queryKey: ["site-config"] });

    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  /* Only trust a state we actually read. Defaulting a failed query to "on"
     painted a green "DAP AI is live" over a console that had loaded nothing,
     which is the worst possible reading of a site that might be off. */
  const status: SiteStatus | null = statusQuery.data?.status ?? null;
  const failed = statusQuery.isError;

  const dot: Record<SiteStatus, string> = {
    on: "bg-emerald-500",
    admin: "bg-amber-500",
    off: "bg-destructive",
  };
  const headline: Record<SiteStatus, string> = {
    on: "DAP AI is live",
    admin: "DAP AI is open to admins only",
    off: "DAP AI is OFF \u2014 maintenance mode",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Site availability</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Anything other than On hides the chat composer and shows visitors the
        maintenance message below. Admin panel keeps the site working for site
        admins, so a change can be checked before it goes back up.
      </p>

      <div className="mt-5 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-4">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${
            failed ? "bg-destructive" : status ? dot[status] : "bg-muted-foreground"
          }`}
        />
        <span className="text-sm font-medium">
          {statusQuery.isLoading
            ? "Loading\u2026"
            : failed
              ? "Could not read the site's state"
              : status
                ? headline[status]
                : "Unknown"}
        </span>
      </div>
      {failed && (
        <p className="mt-2 text-xs text-destructive">
          {statusQuery.error instanceof Error
            ? statusQuery.error.message
            : "The server could not answer."}
        </p>
      )}

      <div
        role="radiogroup"
        aria-label="Site availability"
        className="mt-3 grid gap-2 sm:grid-cols-3"
      >
        {SITE_STATUSES.map((value) => {
          const active = status === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && toggle.mutate(value)}
              disabled={statusQuery.isLoading || failed || toggle.isPending}
              className={`rounded-md border p-3 text-left transition-colors disabled:opacity-60 ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={`inline-flex h-2 w-2 rounded-full ${dot[value]}`}
                />
                {SITE_STATUS_LABELS[value]}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {SITE_STATUS_DESCRIPTIONS[value]}
              </span>
            </button>
          );
        })}
      </div>

      <OfflineMessageEditor />
    </div>
  );
}

function OfflineMessageEditor() {
  const qc = useQueryClient();
  const fetchMsg = useServerFn(getOfflineMessage);
  const saveMsg = useServerFn(adminSetOfflineMessage);
  const msgQuery = useQuery({
    queryKey: ["offline-message"],
    queryFn: () => fetchMsg(),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? msgQuery.data?.message ?? "";

  const save = useMutation({
    mutationFn: (message: string) => saveMsg({ data: { message } }),
    onSuccess: () => {
      toast.success("Offline message saved");
      qc.invalidateQueries({ queryKey: ["offline-message"] });
      qc.invalidateQueries({ queryKey: ["site-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mt-6 rounded-md border border-border bg-muted/20 p-4">
      <h3 className="text-sm font-semibold">Offline message</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Shown inside the typing bar whenever DAP AI is off or in maintenance.
      </p>
      <textarea
        value={value}
        onChange={(e) => setDraft(e.target.value.slice(0, 300))}
        rows={2}
        placeholder="DAP AI is offline right now — check back soon."
        className="mt-3 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {value.length}/300
        </span>
        <Button
          size="sm"
          onClick={() => save.mutate(value.trim())}
          disabled={save.isPending || msgQuery.isLoading}
        >
          Save message
        </Button>
      </div>
    </div>
  );
}


function FeatureList({
  title,
  description,
  keys,
}: {
  title: string;
  description: string;
  keys: readonly FeatureKey[];
}) {
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
      qc.invalidateQueries({ queryKey: ["site-config"] });

    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const flags = flagsQuery.data;
  const flagsFailed = flagsQuery.isError;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      {flagsFailed && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          These could not be read, so the states below are unknown rather than
          on.{" "}
          {flagsQuery.error instanceof Error ? flagsQuery.error.message : ""}
        </p>
      )}

      <ul className="mt-5 divide-y divide-border">
        {keys.map((key) => {
          // Unknown when the read failed — a grey dot, not a green one.
          const enabled = flags ? flags[key] : !flagsFailed;
          return (
            <li
              key={key}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-2.5 w-2.5 rounded-full ${
                      flagsFailed
                        ? "bg-muted-foreground"
                        : enabled
                          ? "bg-emerald-500"
                          : "bg-destructive"
                    }`}
                  />
                  <span className="font-medium">{FEATURE_LABELS[key]}</span>
                </div>
                {FEATURE_DESCRIPTIONS[key] && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {FEATURE_DESCRIPTIONS[key]}
                  </p>
                )}
              </div>
              <Button
                className="w-full sm:w-auto"
                onClick={() => toggle.mutate({ key, enabled: !enabled })}
                disabled={flagsQuery.isLoading || flagsFailed || toggle.isPending}
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


/**
 * Every study room on the site.
 *
 * Closing one down is a soft delete: the row stays so the people who were
 * in it can be told why it is gone. A hard delete would give them "no room
 * with that code", which reads as a fault rather than as a decision.
 */
function StudyRoomsTab() {
  const qc = useQueryClient();
  const listRooms = useServerFn(adminListStudyRooms);
  const removeRoom = useServerFn(adminDeleteStudyRoom);
  const restoreRoom = useServerFn(adminRestoreStudyRoom);
  const [confirming, setConfirming] = useState<{ id: string; name: string } | null>(null);

  const rooms = useQuery({ queryKey: ["admin-rooms"], queryFn: () => listRooms() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-rooms"] });

  const del = useMutation({
    mutationFn: (id: string) => removeRoom({ data: { id } }),
    onSuccess: () => { setConfirming(null); refresh(); toast.success("Room closed."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreRoom({ data: { id } }),
    onSuccess: () => { refresh(); toast.success("Room restored."); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rooms.isLoading) return <p className="text-sm text-muted-foreground">Loading rooms…</p>;
  if (rooms.isError) return <p className="text-sm text-destructive">Couldn't load the rooms.</p>;

  const all = (rooms.data ?? []) as Array<{
    id: string; code: string; name: string; model: string; is_open: boolean;
    created_at: string; deleted_at: string | null; host_name: string;
    member_count: number; message_count: number;
  }>;
  const active = all.filter((r) => !r.deleted_at);
  const closed = all.filter((r) => r.deleted_at);

  const Row = ({ r }: { r: (typeof all)[number] }) => (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {r.name} <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {r.host_name} · {r.member_count} member{r.member_count === 1 ? "" : "s"} ·{" "}
          {r.message_count} message{r.message_count === 1 ? "" : "s"} · {r.model}
        </p>
      </div>
      {r.deleted_at ? (
        <Button size="sm" variant="outline" disabled={restore.isPending}
          onClick={() => restore.mutate(r.id)}>Restore</Button>
      ) : (
        <>
          {/* Opens the room without joining it: no membership row is
              written and no presence is broadcast, so the people in the
              room see no change. Reading only — posting is disabled there,
              since a message would announce who sent it. */}
          <Button asChild size="sm" variant="outline">
            <Link to="/rooms/$code" params={{ code: r.code }} title="Read this room without appearing in it">
              <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Join room
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="text-destructive"
            onClick={() => setConfirming({ id: r.id, name: r.name })}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        </>
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium">Active ({active.length})</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No rooms open right now.</p>
        ) : (
          <ul className="mt-3 space-y-2">{active.map((r) => <Row key={r.id} r={r} />)}</ul>
        )}
      </div>
      {closed.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Closed ({closed.length})</h2>
          <ul className="mt-3 space-y-2 opacity-70">{closed.map((r) => <Row key={r.id} r={r} />)}</ul>
        </div>
      )}

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close "{confirming?.name}" down?</DialogTitle>
            <DialogDescription>
              Everyone in it will see: "Sorry, this room has been deleted by the
              admin. Please contact us for any inquiries." You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setConfirming(null)}>Keep it</Button>
            <Button className="text-destructive-foreground" style={{ background: "hsl(var(--destructive))" }}
              disabled={del.isPending}
              onClick={() => confirming && del.mutate(confirming.id)}>
              {del.isPending ? "Closing…" : "Close it down"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Custom DAPs waiting to go on the marketplace.
 *
 * A published DAP's instructions run in front of other people's
 * conversations on the Orin hardware, so the whole prompt is shown here —
 * reviewing a name and an emoji would be reviewing the label, not the thing.
 */
function DapReviewTab() {
  const qc = useQueryClient();
  const listSubs = useServerFn(adminListDapSubmissions);
  const review = useServerFn(adminReviewDap);
  const [rejecting, setRejecting] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");

  const subs = useQuery({ queryKey: ["admin-dap-subs"], queryFn: () => listSubs() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-dap-subs"] });

  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean; reason?: string }) =>
      review({ data: v }),
    onSuccess: (_r, v) => {
      setRejecting(null); setReason(""); refresh();
      toast.success(v.approve ? "Approved and published." : "Rejected. The author will be told.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (subs.isLoading) return <p className="text-sm text-muted-foreground">Loading submissions…</p>;
  if (subs.isError) return <p className="text-sm text-destructive">Couldn't load submissions.</p>;

  const rows = (subs.data ?? []) as Array<{
    id: string; name: string; emoji: string; description: string;
    system_prompt: string; author_name: string; author_email: string;
    submitted_at: string; moderation_status: string; rejection_reason: string | null;
  }>;
  const pending = rows.filter((r) => r.moderation_status === "pending");
  const done = rows.filter((r) => r.moderation_status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium">Waiting ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((d) => (
              <li key={d.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl" aria-hidden>{d.emoji}</span>
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">
                    by {d.author_name} ({d.author_email})
                  </span>
                </div>
                {d.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                )}
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  {d.system_prompt}
                </pre>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="text-primary-foreground"
                    style={{ background: "var(--gradient-brand)" }}
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: d.id, approve: true })}>
                    <Globe className="mr-1.5 h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive"
                    onClick={() => setRejecting({ id: d.id, name: d.name })}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {done.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Previously rejected ({done.length})</h2>
          <ul className="mt-3 space-y-2 text-sm opacity-70">
            {done.map((d) => (
              <li key={d.id} className="rounded-xl border border-border bg-card p-3">
                <span aria-hidden>{d.emoji}</span> <span className="font-medium">{d.name}</span>
                {d.rejection_reason && (
                  <span className="text-muted-foreground"> — {d.rejection_reason}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject "{rejecting?.name}"?</DialogTitle>
            <DialogDescription>
              It stays private and the author is told next time they open the
              Custom AI's page. A reason helps them fix it.
            </DialogDescription>
          </DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Why not? (optional)" maxLength={300} />
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button disabled={decide.isPending}
              onClick={() => rejecting && decide.mutate({ id: rejecting.id, approve: false, reason })}>
              {decide.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Add, rename, reorder, enable and remove the models the picker offers.
 *
 * The label is the part that matters operationally: it is sent to the
 * orchestrator verbatim as the model to route on, so renaming one changes
 * what the hardware is asked for. The form says that where it is relevant
 * rather than in a note nobody reads.
 */
function ModelManager() {
  const qc = useQueryClient();
  const list = useServerFn(adminListModels);
  const save = useServerFn(adminSaveModel);
  const remove = useServerFn(adminDeleteModel);
  const reorder = useServerFn(adminReorderModels);
  const [draft, setDraft] = useState<StoredModel | null>(null);

  const models = useQuery({ queryKey: ["admin-models"], queryFn: () => list() });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-models"] });
    qc.invalidateQueries({ queryKey: ["models"] });
  };

  const saveMut = useMutation({
    mutationFn: (m: StoredModel) => save({ data: m }),
    onSuccess: () => { setDraft(null); refresh(); toast.success("Model saved."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { refresh(); toast.success("Model removed."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const orderMut = useMutation({
    mutationFn: (ids: string[]) => reorder({ data: { ids } }),
    onSuccess: () => { refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (models.data ?? []) as StoredModel[];
  const move = (i: number, dir: -1 | 1) => {
    const next = [...rows];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    orderMut.mutate(next.map((m) => m.id));
  };

  const blank: StoredModel = {
    id: "", label: "", description: "", min_tier: "free",
    lite: true, enabled: true, sort_order: (rows.length + 1) * 10,
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Model list</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What the picker offers, top to bottom. The name is sent to the
        inference hardware exactly as written here — renaming a model changes
        which one it asks for.
      </p>

      {models.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : models.isError ? (
        <p className="mt-4 text-sm text-destructive">Couldn&rsquo;t load the models.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {rows.map((m, i) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="outline" className="h-6 w-6 p-0"
                  disabled={i === 0 || orderMut.isPending} onClick={() => move(i, -1)}
                  aria-label="Move up">↑</Button>
                <Button size="sm" variant="outline" className="h-6 w-6 p-0"
                  disabled={i === rows.length - 1 || orderMut.isPending} onClick={() => move(i, 1)}
                  aria-label="Move down">↓</Button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.label}{" "}
                  <span className="font-mono text-xs text-muted-foreground">{m.id}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {TIER_LABEL[m.min_tier as keyof typeof TIER_LABEL] ?? m.min_tier} and up ·{" "}
                  {m.lite ? "lite backend" : "full backend"} ·{" "}
                  {m.enabled ? "shown in the picker" : "hidden"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDraft(m)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="text-destructive"
                disabled={delMut.isPending}
                onClick={() => delMut.mutate(m.id)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button className="mt-4" size="sm" variant="outline" onClick={() => setDraft(blank)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add a model
      </Button>

      {draft && (
        <div className="mt-5 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted-foreground">Name shown to users, and sent to the hardware</span>
              <Input className="mt-1" value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">Internal id (cannot change later)</span>
              <Input className="mt-1 font-mono" value={draft.id}
                disabled={rows.some((r) => r.id === draft.id)}
                placeholder="dap-ai-something"
                onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Description under the picker</span>
            <Input className="mt-1" value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm">
              <span className="text-muted-foreground">Minimum plan</span>
              <select className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={draft.min_tier}
                onChange={(e) => setDraft({ ...draft, min_tier: e.target.value })}>
                {["free", "go", "pro", "exclusive"].map((t) => (
                  <option key={t} value={t}>{TIER_LABEL[t as keyof typeof TIER_LABEL] ?? t}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.lite}
                onChange={(e) => setDraft({ ...draft, lite: e.target.checked })} />
              Lite backend (text only)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              Show in the picker
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!draft.id || !draft.label || saveMut.isPending}
              onClick={() => saveMut.mutate(draft)}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
