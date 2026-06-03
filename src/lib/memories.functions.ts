/**
 * Per-user AI memories (ChatGPT-style). Scoped to the signed-in user by RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_MEMORIES = 50;

export const listMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("user_memories")
      .select("id, content, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ content: z.string().trim().min(1).max(500) }).parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Enforce a soft cap by trimming oldest.
    const { data: existing } = await supabase
      .from("user_memories")
      .select("id")
      .order("created_at", { ascending: false });
    if (existing && existing.length >= MAX_MEMORIES) {
      const toDelete = existing.slice(MAX_MEMORIES - 1).map((m) => m.id);
      if (toDelete.length > 0) {
        await supabase.from("user_memories").delete().in("id", toDelete);
      }
    }
    const { data: row, error } = await supabase
      .from("user_memories")
      .insert({ user_id: userId, content: data.content })
      .select("id, content, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("user_memories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_memories")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
