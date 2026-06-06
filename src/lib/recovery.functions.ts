/**
 * Password-recovery server functions.
 * Uses a recovery question + answer stored on the profile. The answer is
 * normalized (lowercased + trimmed) and hashed with a per-row random salt
 * using SHA-256, so it's never recoverable in plain text.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function hashAnswer(answer: string, salt: string) {
  const norm = answer.trim().toLowerCase();
  return createHash("sha256").update(`${salt}:${norm}`).digest("hex");
}

function makeStored(answer: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${hashAnswer(answer, salt)}`;
}

function verifyStored(stored: string, answer: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = hashAnswer(answer, salt);
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
  } catch {
    return false;
  }
}

/** Called right after sign-up by the logged-in user to save their question. */
export const setRecoveryQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        question: z.string().trim().min(3).max(200),
        answer: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        recovery_question: data.question,
        recovery_answer_hash: makeStored(data.answer),
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: look up the recovery question for an email. */
export const getRecoveryQuestion = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(i)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("recovery_question")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();
    // Don't reveal whether the email exists.
    return { question: row?.recovery_question ?? null };
  });

/** Public: verify answer and reset the password. */
export const resetPasswordWithAnswer = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        answer: z.string().trim().min(1).max(200),
        newPassword: z.string().min(6).max(200),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, recovery_answer_hash")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();
    if (!row?.recovery_answer_hash) {
      throw new Error("Couldn't verify your recovery answer.");
    }
    if (!verifyStored(row.recovery_answer_hash, data.answer)) {
      throw new Error("That answer doesn't match. Please try again.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(row.id, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
