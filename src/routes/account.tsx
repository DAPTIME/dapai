import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMyProfile } from "@/lib/use-my-profile";
import { updateMyName, updateMyAvatar } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { PlanAndUsage } from "@/components/plan-and-usage";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account details — DAP AI" },
      {
        name: "description",
        content: "Update your DAP AI display name and profile picture.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useMyProfile();

  const saveName = useServerFn(updateMyName);
  const saveAvatarPath = useServerFn(updateMyAvatar);

  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (profile.data?.name) setName(profile.data.name);
  }, [profile.data?.name]);

  const nameMut = useMutation({
    mutationFn: (n: string) => saveName({ data: { name: n } }),
    onSuccess: () => {
      toast.success("Name updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeAvatar = useMutation({
    mutationFn: async () => {
      const path = profile.data?.avatarPath;
      if (path) {
        await supabase.storage.from("avatars").remove([path]);
      }
      await saveAvatarPath({ data: { avatarPath: null } });
    },
    onSuccess: () => {
      toast.success("Profile picture removed");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const onFile = async (file: File) => {
    if (!user) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Please choose a PNG, JPEG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image must be 5MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // Best-effort: remove the previous avatar file.
      const oldPath = profile.data?.avatarPath;
      if (oldPath && oldPath !== path) {
        await supabase.storage.from("avatars").remove([oldPath]);
      }

      await saveAvatarPath({ data: { avatarPath: path } });
      toast.success("Profile picture updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const avatarUrl = profile.data?.avatarUrl;
  const displayName = name || profile.data?.name || user?.name || "";
  const initials = (displayName || user?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Account details</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Update how you appear across DAP AI.
      </p>

      <div className="mt-8 space-y-6">
        <PlanAndUsage />

        <div className="rounded-2xl border border-border bg-card p-5">
          <Label className="text-base">Profile picture</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            PNG, JPEG, WEBP or GIF, up to 5MB. Changes apply everywhere.
          </p>

          <div className="mt-4 flex items-center gap-4">
            <div
              className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold text-primary-foreground"
              style={avatarUrl ? undefined : { background: "var(--gradient-brand)" }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Your avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ background: "var(--gradient-brand)" }}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-4 w-4" />
                )}
                {avatarUrl ? "Change photo" : "Upload photo"}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => removeAvatar.mutate()}
                  disabled={removeAvatar.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED_TYPES.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </div>
          </div>
        </div>

        <form
          className="rounded-2xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = name.trim();
            if (v.length < 1) {
              toast.error("Name can't be empty.");
              return;
            }
            nameMut.mutate(v);
          }}
        >
          <Label htmlFor="name" className="text-base">
            Display name
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown in the app header and in your chats.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              id="name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
            <Button
              type="submit"
              disabled={nameMut.isPending || !name.trim()}
              style={{ background: "var(--gradient-brand)" }}
            >
              {nameMut.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Email: {profile.data?.email ?? user?.email}
          </p>
        </form>

        <ConnectedAccounts />
      </div>
    </div>
  );
}

/**
 * Connect / disconnect Google (and GitHub) to an existing email account so the
 * same person can sign in either way.
 */
function ConnectedAccounts() {
  const qc = useQueryClient();
  const identities = useQuery({
    queryKey: ["my-identities"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      return data?.identities ?? [];
    },
    staleTime: 60_000,
  });

  const providers = [
    { id: "google" as const, label: "Google" },
    { id: "github" as const, label: "GitHub" },
  ];

  const link = async (provider: "google" | "github") => {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/account` },
    });
    // Auth errors are mostly readable, but not reliably — some are internal
    // and none are worth the risk of pasting verbatim into the page.
    if (error) {
      console.error("[account] link identity:", error.message);
      toast.error(`Couldn't connect ${provider}. Try again.`);
    }
  };

  const unlink = async (provider: string) => {
    const all = identities.data ?? [];
    if (all.length <= 1) {
      toast.error("You need at least one sign-in method.");
      return;
    }
    const target = all.find((i) => i.provider === provider);
    if (!target) return;
    const { error } = await supabase.auth.unlinkIdentity(target);
    if (error) {
      console.error("[account] unlink identity:", error.message);
      toast.error(`Couldn't disconnect ${provider}. Try again.`);
      return;
    }
    toast.success(`${provider} disconnected`);
    qc.invalidateQueries({ queryKey: ["my-identities"] });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <Label className="text-base">Connected accounts</Label>
      <p className="mt-1 text-sm text-muted-foreground">
        Link Google or GitHub to your account — then you can sign in either with
        your email and password or with one click.
      </p>
      <div className="mt-4 space-y-2">
        {providers.map((p) => {
          const linked = (identities.data ?? []).some(
            (i: { provider: string }) => i.provider === p.id
          );
          return (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3"
            >
              <div className="text-sm">
                <span className="font-medium">{p.label}</span>
                <span className="ml-2 text-muted-foreground">
                  {linked ? "Connected" : "Not connected"}
                </span>
              </div>
              {linked ? (
                <Button type="button" variant="outline" size="sm" onClick={() => unlink(p.id)}>
                  Disconnect
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => link(p.id)}>
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

