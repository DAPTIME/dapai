import { dbError } from "./db-error";
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
    if (error) throw dbError(error);
    return { ok: true };
  });

/** Public: look up the recovery question for an email and open a 5-minute reset session. */
export const getRecoveryQuestion = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ email: z.string().trim().email({ message: "Please enter a valid email address." }).max(255) }).parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();

    /* Bounded per IP. This endpoint takes any address, says whether it has
       a recovery question, and writes a password_reset_sessions row every
       time it does — so unbounded it is both an account-enumeration oracle
       and a way to fill that table. Every other entry point in this file
       already spends an attempt; this one did not.

       Fails open, like the other limiters: a rate limiter that takes
       account recovery down when the database hiccups has done more damage
       than the abuse it guards against. */
    const { consumeIpQuota } = await import("./rate-limit.server");
    if (!(await consumeIpQuota("attempt:recovery-question", 10, 10 * 60 * 1000))) {
      throw new Error("Too many attempts. Please wait a few minutes and try again.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("recovery_question")
      .eq("email", email)
      .maybeSingle();
    // Don't reveal whether the email exists.
    if (!row?.recovery_question) return { question: null, token: null, expiresInMs: 0 };

    const { requestIp } = await import("./rate-limit.server");
    const { createResetSession } = await import("./reset-session.server");
    const session = await createResetSession(email, requestIp());
    return { question: row.recovery_question, token: session.token, expiresInMs: session.expiresInMs };
  });

/**
 * Public: verify the answer inside the 5-minute reset session, set a new
 * password AND a fresh recovery question + answer.
 */
export const resetPasswordWithAnswer = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z.string().trim().email({ message: "Please enter a valid email address." }).max(255),
        token: z.string().trim().min(10).max(200),
        answer: z.string().trim().min(1).max(200),
        newPassword: z.string().min(8).max(200),
        newQuestion: z.string().trim().min(3).max(200),
        newAnswer: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { consumeAttempt, clearAttempts, RECOVERY_ANSWER_POLICY } =
      await import("./attempt-limit.server");
    // Count the guess before checking it, so brute force gets locked out.
    await consumeAttempt(RECOVERY_ANSWER_POLICY);

    const { consumeResetSession } = await import("./reset-session.server");
    await consumeResetSession(email, data.token);

    const { assertPasswordPolicy } = await import("./password-policy");
    assertPasswordPolicy(data.newPassword, { email });
    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.newPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, recovery_answer_hash")
      .eq("email", email)
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
    if (error) throw dbError(error);

    const { error: qErr } = await supabaseAdmin
      .from("profiles")
      .update({
        recovery_question: data.newQuestion,
        recovery_answer_hash: makeStored(data.newAnswer),
      })
      .eq("id", row.id);
    if (qErr) throw dbError(qErr);
    await clearAttempts(RECOVERY_ANSWER_POLICY);
    return { ok: true };
  });



/**
 * Signed-in: verify the account password AND the current recovery answer,
 * then update to a new question + answer.
 */
export const changeRecoveryQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        currentPassword: z.string().min(1).max(200),
        currentAnswer: z.string().trim().min(1).max(200),
        newQuestion: z.string().trim().min(3).max(200),
        newAnswer: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { consumeAttempt, clearAttempts, RECOVERY_ANSWER_POLICY } =
      await import("./attempt-limit.server");
    await consumeAttempt(RECOVERY_ANSWER_POLICY);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("email, recovery_answer_hash")
      .eq("id", userId)
      .maybeSingle();
    if (!row?.recovery_answer_hash) {
      throw new Error("No recovery question is set on your account yet.");
    }
    const { verifyCurrentPassword } = await import("./verify-password.server");
    if (
      !row.email ||
      !(await verifyCurrentPassword(row.email, data.currentPassword))
    ) {
      throw new Error("Your current password is incorrect.");
    }
    if (!verifyStored(row.recovery_answer_hash, data.currentAnswer)) {
      throw new Error("That answer doesn't match your current recovery answer.");
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        recovery_question: data.newQuestion,
        recovery_answer_hash: makeStored(data.newAnswer),
      })
      .eq("id", userId);
    if (error) throw dbError(error);
    await clearAttempts(RECOVERY_ANSWER_POLICY);
    return { ok: true };
  });

/**
 * Signed-in: change your password. Requires BOTH your current password and
 * your recovery answer, is rate limited per network, and the new password is
 * screened against known breached passwords.
 */
export const changePasswordWithAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        currentPassword: z.string().min(1).max(200),
        answer: z.string().trim().min(1).max(200),
        newPassword: z.string().min(8).max(200),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { consumeAttempt, clearAttempts, PASSWORD_CHANGE_POLICY } =
      await import("./attempt-limit.server");
    await consumeAttempt(PASSWORD_CHANGE_POLICY);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("email, name, recovery_answer_hash")
      .eq("id", userId)
      .maybeSingle();
    if (!row?.recovery_answer_hash) {
      throw new Error("No recovery question is set on your account.");
    }

    const { assertPasswordPolicy } = await import("./password-policy");
    assertPasswordPolicy(data.newPassword, { email: row.email, name: row.name });
    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.newPassword);

    const { verifyCurrentPassword } = await import("./verify-password.server");
    if (
      !row.email ||
      !(await verifyCurrentPassword(row.email, data.currentPassword))
    ) {
      throw new Error("Your current password is incorrect.");
    }
    if (!verifyStored(row.recovery_answer_hash, data.answer)) {
      throw new Error("That answer doesn't match. Please try again.");
    }
    if (data.newPassword === data.currentPassword) {
      throw new Error("Please choose a password you haven't used before.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (error) throw dbError(error);
    await clearAttempts(PASSWORD_CHANGE_POLICY);
    return { ok: true };
  });


/** Returns whether the current user has a recovery question set (and the question text). */
export const getMyRecoveryQuestion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("recovery_question, recovery_answer_hash")
      .eq("id", userId)
      .maybeSingle();
    return {
      question: row?.recovery_question ?? null,
      hasAnswer: !!row?.recovery_answer_hash,
    };
  });


/**
 * Migration setup: accounts that existed before the backend move must pick a
 * new password and a fresh recovery question before using the app again.
 */
export const getAccountSetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("password_reset_required, recovery_question")
      .eq("id", userId)
      .maybeSingle();
    return {
      // Only legacy accounts flagged during the backend move are gated.
      // A missing recovery question alone must never block the app —
      // social (Google/GitHub) signups start without one by design.
      needsSetup: !!row?.password_reset_required,
      question: row?.recovery_question ?? null,

    };
  });

export const completeAccountSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        newPassword: z.string().min(8).max(200),
        question: z.string().trim().min(3).max(200),
        answer: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { assertPasswordPolicy } = await import("./password-policy");
    assertPasswordPolicy(data.newPassword);
    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.newPassword);

    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (pwErr) throw dbError(pwErr);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        recovery_question: data.question,
        recovery_answer_hash: makeStored(data.answer),
        password_reset_required: false,
      })
      .eq("id", userId);
    if (error) throw dbError(error);
    return { ok: true };
  });

/**
 * Public: email a secure, single-use reset link (10 minutes) that lets the
 * owner of the address set a new password AND a new recovery question.
 * The link always points at the public site, never at a local dev origin.
 */
export const sendPasswordResetLink = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z
          .string()
          .trim()
          .email({ message: "Please enter a valid email address." })
          .max(255),
        origin: z.string().trim().url().max(300).optional(),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { consumeEmailQuota, requestIp } = await import("./rate-limit.server");
    await consumeEmailQuota("password-reset", email);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .eq("email", email)
      .maybeSingle();
    // Never reveal whether the address exists.
    if (!row) return { ok: true };

    const { createResetSession } = await import("./reset-session.server");
    const session = await createResetSession(email, requestIp());

    const { resolveSiteUrl } = await import("./site-url.server");
    const site = resolveSiteUrl(data.origin ?? null);
    const link = `${site}/reset-password?token=${encodeURIComponent(session.token)}&email=${encodeURIComponent(email)}`;

    // Supabase Auth sends this through the configured SMTP provider. Keep the
    // app's single-use token in the redirect so the recovery-question reset
    // flow remains intact after the email link is opened.
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: link,
    });
    if (error) {
      console.error("[reset] Supabase SMTP delivery failed:", error.message);
      throw new Error(
        "We couldn't send your reset email right now. Please try again in a minute, or contact DAPAI.support@gmail.com."
      );
    }
    return { ok: true, via: "supabase" as const };
  });

/**
 * Public: complete a reset using the emailed single-use token. Ownership of the
 * inbox is the proof, so no recovery answer is required — but a fresh recovery
 * question + answer must be set.
 */
export const resetPasswordWithLink = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z.string().trim().email({ message: "Please enter a valid email address." }).max(255),
        token: z.string().trim().min(10).max(200),
        newPassword: z.string().min(8).max(200),
        newQuestion: z.string().trim().min(3).max(200),
        newAnswer: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { consumeResetSession } = await import("./reset-session.server");
    await consumeResetSession(email, data.token);

    const { assertPasswordPolicy } = await import("./password-policy");
    assertPasswordPolicy(data.newPassword, { email });
    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.newPassword);


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!row) throw new Error("We couldn't find that account.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(row.id, {
      password: data.newPassword,
    });
    if (error) throw dbError(error);

    const { error: qErr } = await supabaseAdmin
      .from("profiles")
      .update({
        recovery_question: data.newQuestion,
        recovery_answer_hash: makeStored(data.newAnswer),
        password_reset_required: false,
      })
      .eq("id", row.id);
    if (qErr) throw dbError(qErr);
    return { ok: true };
  });
