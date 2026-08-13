import { dbError } from "./db-error";
/**
 * Memory Vault — per-user AI memories (ChatGPT-style). Every row is scoped
 * to the signed-in user by RLS, so memories are strictly private.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_MEMORIES = 200;

export const listMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("user_memories")
      .select("id, content, enabled, source, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
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
      .insert({ user_id: userId, content: data.content, source: "user" })
      .select("id, content, enabled, source, created_at, updated_at")
      .single();
    if (error) throw dbError(error);
    return row;
  });

/** Edit a memory's text and/or flip whether DAP AI is allowed to use it. */
export const updateMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        content: z.string().trim().min(1).max(500).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.content !== undefined) patch.content = data.content;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    const { data: row, error } = await supabase
      .from("user_memories")
      .update(patch)
      .eq("id", data.id)
      .select("id, content, enabled, source, created_at, updated_at")
      .single();
    if (error) throw dbError(error);
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
    if (error) throw dbError(error);
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
    if (error) throw dbError(error);
    return { ok: true };
  });
