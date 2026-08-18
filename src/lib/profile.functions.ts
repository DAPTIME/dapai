import { dbError } from "./db-error";
/**
 * Profile self-service: read own profile, update name & avatar path.
 * Avatar files themselves are uploaded client-side to the private "avatars"
 * bucket; this stores/reads the path and signs a URL for display.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw dbError(error);

    let avatarSignedUrl: string | null = null;
    if (data?.avatar_url) {
      const { data: signed } = await supabase.storage
        .from("avatars")
        .createSignedUrl(data.avatar_url, 60 * 60 * 24);
      avatarSignedUrl = signed?.signedUrl ?? null;
    }

    return {
      id: data?.id ?? userId,
      name: data?.name ?? null,
      email: data?.email ?? null,
      avatarPath: data?.avatar_url ?? null,
      avatarUrl: avatarSignedUrl,
    };
  });

export const updateMyName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ name: z.string().trim().min(1).max(80) }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ name: data.name })
      .eq("id", userId);
    if (error) throw dbError(error);
    // Keep auth user_metadata.name in sync — best effort. The rename above
    // already succeeded through the caller's own client, so a missing
    // service-role key must not turn a completed rename into an error toast.
    const { tryAdminClient } = await import("./admin-client.server");
    const adminClient = await tryAdminClient();
    if (adminClient) {
      await adminClient.auth.admin
        .updateUserById(userId, { user_metadata: { name: data.name } })
        .catch((e) => console.warn("[profile] metadata sync skipped:", e?.message));
    }
    return { ok: true };
  });

export const updateMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ avatarPath: z.string().trim().min(1).max(500).nullable() }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Ensure user only sets a path they own (starts with their id/).
    if (data.avatarPath && !data.avatarPath.startsWith(`${userId}/`)) {
      throw new Error("Invalid avatar path.");
    }
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: data.avatarPath })
      .eq("id", userId);
    if (error) throw dbError(error);
    return { ok: true };
  });
