import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSiteConfig } from "@/lib/site-config";
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
import { Cpu, Shield, Lock, KeyRound, Pencil, Eye, Trash2, Power, MoreHorizontal, Crown, Ban, Check, , Globe, PanelLeft, FlaskConical } from "lucide-react";
import { TIER_LABEL } from "@/lib/tier-gate";
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
  getSiteStatus,
  adminSetSiteStatus,
  getOfflineMessage,
  adminSetOfflineMessage,
  getFeatureFlags,
  adminSetFeatureFlag,
  adminSetBetaTier,
} from "@/lib/admin.functions";


import {
  FEATURE_GROUPS,
  FEATURE_LABELS,
  type FeatureKey,
} from "@/lib/admin-config";

const FEATURE_DESCRIPTIONS: Partial<Record<FeatureKey, string>> = {};

/** The console's sections, in the order they appear. */
const SECTIONS = [
  { id: "users", label: "Users", icon: Shield },
  { id: "site", label: "Site", icon: Cpu },
  { id: "pages", label: "Pages", icon: Eye },
  { id: "sidebar", label: "Sidebar", icon: PanelLeft },
  { id: "beta", label: "Beta", icon: FlaskConical },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];


import {
  SITE_STATUSES,
  SITE_STATUS_LABELS,
  SITE_STATUS_DESCRIPTIONS,
  type SiteStatus,
} from "@/lib/site-status";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — DAP Games" },
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
          <TabsContent value="site" className="mt-6 space-y-6">
            <SiteTab />
          </TabsContent>
          <TabsContent value="pages" className="mt-6">
            <FeatureList
              title="Pages & features"
              description="Anyone using a page you turn off is sent back to the home page."
              keys={FEATURE_GROUPS.pages}
            />
          </TabsContent>
          <TabsContent value="sidebar" className="mt-6">
            <FeatureList
              title="Sidebar"
              description="Turn an entry off to take it out of everyone's sidebar. The page itself keeps working for anyone with the link — use Pages & features to close a page outright. You will still see a hidden entry yourself, greyed out and marked, so you can find your way back to it."
              keys={FEATURE_GROUPS.sidebar}
            />
          </TabsContent>
          <TabsContent value="beta" className="mt-6">
            <BetaList keys={FEATURE_GROUPS.beta} />
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



/**
 * Which features are in beta, and the lowest plan that may use one.
 *
 * Off is the ordinary state. Choosing a plan puts the feature behind it
 * while it is being tried out; Go is the floor, because beta access is
 * something people pay for. The site config is the source of truth here —
 * the same read every page and the sidebar use — so this reflects exactly
 * what visitors are getting.
 */
function BetaList({ keys }: { keys: readonly FeatureKey[] }) {
  const qc = useQueryClient();
  const siteConfig = useSiteConfig();
  const setBeta = useServerFn(adminSetBetaTier);

  const save = useMutation({
    mutationFn: (v: { key: FeatureKey; tier: string }) =>
      setBeta({ data: { key: v.key, tier: v.tier as "off" | "go" | "pro" | "exclusive" } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["site-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const OPTIONS: Array<{ value: string; label: string }> = [
    { value: "off", label: "Not in beta" },
    { value: "go", label: `${TIER_LABEL.go} and up` },
    { value: "pro", label: `${TIER_LABEL.pro} and up` },
    { value: "exclusive", label: `${TIER_LABEL.exclusive} only` },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Beta features</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Put something behind a plan while you are still testing it. Anyone
        below the plan you choose will not see it in the sidebar, and is sent
        home if they open the link. Go is the lowest a beta can be set to.
        Turning a feature off under Pages still closes it for everyone.
      </p>

      <ul className="mt-5 divide-y divide-border">
        {keys.map((key) => {
          const current = siteConfig.beta[key] ?? "off";
          return (
            <li key={key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-2.5 w-2.5 rounded-full ${
                      current === "off" ? "bg-muted-foreground" : "bg-primary"
                    }`}
                  />
                  <span className="font-medium">{FEATURE_LABELS[key]}</span>
                  {current !== "off" && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Beta
                    </span>
                  )}
                </div>
              </div>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm sm:w-56"
                value={current}
                disabled={save.isPending}
                onChange={(e) => save.mutate({ key, tier: e.target.value })}
              >
                {OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
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
 * Community DAP Track levels people have published.
 *
 * Unpublishing hides a level from the browser but keeps it for its author;
 * deleting removes it outright, which is why it asks first.
 */
function TrackReviewTab() {
  const qc = useQueryClient();
  const list = useServerFn(adminListPublicTracks);
  const setPublished = useServerFn(adminSetTrackPublished);
  const remove = useServerFn(adminDeleteTrack);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const tracks = useQuery({ queryKey: ["admin-tracks"], queryFn: () => list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-tracks"] });

  const publish = useMutation({
    mutationFn: (v: { id: string; isPublic: boolean }) => setPublished({ data: v }),
    onSuccess: (_r, v) => { refresh(); toast.success(v.isPublic ? "Published." : "Unpublished."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { setConfirmDelete(null); refresh(); toast.success("Track deleted."); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (tracks.isLoading) return <p className="text-sm text-muted-foreground">Loading tracks…</p>;
  if (tracks.isError) return <p className="text-sm text-destructive">Couldn't load tracks.</p>;

  const rows = tracks.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Community tracks ({rows.length})</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every level someone has shared. Unpublish takes it out of the browser
        and leaves it with its author; delete removes it for good.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nothing shared yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.season} · {t.play_count} plays · {t.owner_email ?? t.owner_id}
                  {!t.is_public && " · unpublished"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate({ id: t.id, isPublic: !t.is_public })}
                >
                  {t.is_public ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setConfirmDelete({ id: t.id, name: t.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{confirmDelete?.name}"?</DialogTitle>
            <DialogDescription>
              The level and its times are removed for everyone, including its
              author. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={del.isPending}
              onClick={() => confirmDelete && del.mutate(confirmDelete.id)}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
