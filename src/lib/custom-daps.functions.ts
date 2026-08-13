import { dbError } from "./db-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TIER_RANK, type Tier } from "@/lib/tier-rank";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DapInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional().default(""),
  emoji: z.string().max(8).optional().default("✨"),
  systemPrompt: z.string().min(1).max(4000),
  opener: z.string().max(1000).optional().default(""),
});

async function requirePro(
  supabase: { from: (t: string) => any },
  userId: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .single();
  if (TIER_RANK[(profile?.tier as Tier) ?? "free"] < TIER_RANK.pro) {
    throw new Error("Custom AI's are a Pro feature. Upgrade to create or use them.");
  }
}

export const listCustomDaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requirePro(supabase, userId);
    const { data, error } = await supabase
      .from("custom_daps")
      .select("id, name, description, emoji, system_prompt, opener, created_at")
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
    return data ?? [];
  });

export const createCustomDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DapInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePro(supabase, userId);
    const { data: row, error } = await supabase
      .from("custom_daps")
      .insert({
        user_id: userId,
        name: data.name,
        description: data.description,
        emoji: data.emoji || "✨",
        system_prompt: data.systemPrompt,
        opener: data.opener,
      })
      .select("id, name, description, emoji, system_prompt, opener, created_at")
      .single();
    if (error) throw dbError(error);
    return row;
  });

export const deleteCustomDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("custom_daps")
      .delete()
      .eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true };
  });

/**
 * Marketplace: a Pro user can publish one of their Custom AI's (optionally
 * with an MCP tool URL) into a directory other signed-in users can browse
 * and install. Publishing only flips a flag on the owner's own row — RLS
 * still keeps unpublished rows private.
 */
export const setCustomDapPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        published: z.boolean(),
        authorName: z.string().trim().max(40).optional(),
        mcpUrl: z.string().trim().max(300).optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePro(supabase, userId);
    if (data.mcpUrl && !/^https:\/\/\S+$/i.test(data.mcpUrl)) {
      throw new Error("A tool URL must be a full https:// address.");
    }
    const { error } = await supabase
      .from("custom_daps")
      .update({
        published: data.published,
        ...(data.authorName ? { author_name: data.authorName } : {}),
        ...(data.mcpUrl !== undefined ? { mcp_url: data.mcpUrl || null } : {}),
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw dbError(error);
    return { ok: true };
  });

export const listMarketplaceDaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("custom_daps")
      .select(
        "id, name, description, emoji, author_name, install_count, mcp_url, user_id, created_at"
      )
      .eq("published", true)
      .order("install_count", { ascending: false })
      .limit(60);
    if (error) throw dbError(error);
    const { data: mine } = await supabase
      .from("custom_daps")
      .select("source_id")
      .eq("user_id", userId);
    const installed = new Set(
      (mine ?? []).map((m: { source_id: string | null }) => m.source_id).filter(Boolean)
    );
    return (data ?? []).map((d: any) => ({
      ...d,
      mine: d.user_id === userId,
      installed: installed.has(d.id),
    }));
  });

export const installMarketplaceDap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ sourceId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePro(supabase, userId);
    const { data: newId, error } = await supabase.rpc("install_custom_dap", {
      _source_id: data.sourceId,
    });
    if (error) throw dbError(error);
    return { id: newId as string };
  });
