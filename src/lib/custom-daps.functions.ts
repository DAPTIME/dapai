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
