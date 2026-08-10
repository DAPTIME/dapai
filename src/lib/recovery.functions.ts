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

/** Public: look up the recovery question for an email and open a 5-minute reset session. */
export const getRecoveryQuestion = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ email: z.string().trim().email({ message: "Please enter a valid email address." }).max(255) }).parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
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
        newPassword: z.string().min(6).max(200),
        // Optional: a normal reset (recovery question already on file) only
        // changes the password. The lockout path handles question resets.
        newQuestion: z.string().trim().min(3).max(200).optional(),
        newAnswer: z.string().trim().min(2).max(200).optional(),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { consumeResetSession } = await import("./reset-session.server");
    await consumeResetSession(email, data.token);

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
    if (error) throw new Error(error.message);

    if (data.newQuestion && data.newAnswer) {
      const { error: qErr } = await supabaseAdmin
        .from("profiles")
        .update({
          recovery_question: data.newQuestion,
          recovery_answer_hash: makeStored(data.newAnswer),
        })
        .eq("id", row.id);
      if (qErr) throw new Error(qErr.message);
    }
    return { ok: true };
  });


/** Signed-in: verify the current recovery answer, then update to a new question+answer. */
export const changeRecoveryQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        currentAnswer: z.string().trim().min(1).max(200),
        newQuestion: z.string().trim().min(3).max(200),
        newAnswer: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("recovery_answer_hash")
      .eq("id", userId)
      .maybeSingle();
    if (!row?.recovery_answer_hash) {
      throw new Error("No recovery question is set on your account yet.");
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
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Signed-in: change your password by re-verifying your recovery answer. */
export const changePasswordWithAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        answer: z.string().trim().min(1).max(200),
        newPassword: z.string().min(6).max(200),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.newPassword);
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("recovery_answer_hash")
      .eq("id", userId)
      .maybeSingle();
    if (!row?.recovery_answer_hash) {
      throw new Error("No recovery question is set on your account.");
    }
    if (!verifyStored(row.recovery_answer_hash, data.answer)) {
      throw new Error("That answer doesn't match. Please try again.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
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
      needsSetup:
        !!row?.password_reset_required || !row?.recovery_question,
      question: row?.recovery_question ?? null,
    };
  });

export const completeAccountSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        newPassword: z.string().min(6).max(200),
        question: z.string().trim().min(3).max(200),
        answer: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ context, data }) => {
    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.newPassword);
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (pwErr) throw new Error(pwErr.message);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        recovery_question: data.question,
        recovery_answer_hash: makeStored(data.answer),
        password_reset_required: false,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Lockout path: the account has NO recovery question on file, so there is
 * nothing to ask. We email a single-use reinstatement link (valid 10 minutes)
 * that lets the owner set a new password AND a fresh recovery question.
 * Always returns ok so the endpoint never reveals whether an email exists.
 */
export const requestAccountReinstatement = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z.string().trim().email({ message: "Please enter a valid email address." }).max(255),
        origin: z.string().trim().url().max(300),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, name, recovery_question")
      .eq("email", email)
      .maybeSingle();

    // Only the lockout case gets a link; accounts with a question use the
    // normal question-based reset instead.
    if (!row || row.recovery_question) return { ok: true };

    const { consumeEmailQuota, requestIp } = await import("./rate-limit.server");
    await consumeEmailQuota("reinstate");

    const { createResetSession } = await import("./reset-session.server");
    const session = await createResetSession(email, requestIp());
    const link = `${data.origin.replace(/\/$/, "")}/reinstate?email=${encodeURIComponent(
      email
    )}&token=${session.token}`;

    const { sendEmail, reinstateEmailHtml } = await import("./email.server");
    await sendEmail({
      to: email,
      subject: "Restore access to your DAP AI account",
      html: reinstateEmailHtml({ name: row.name ?? "", link }),
      text: `Restore access to your DAP AI account: ${link} (expires in 10 minutes)`,
    });
    return { ok: true };
  });

/** Completes a reinstatement: sets a new password + recovery question. */
export const completeAccountReinstatement = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z.string().trim().email({ message: "Please enter a valid email address." }).max(255),
        token: z.string().trim().min(10).max(200),
        newPassword: z.string().min(6).max(200),
        newQuestion: z.string().trim().min(3).max(200),
        newAnswer: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { consumeResetSession } = await import("./reset-session.server");
    await consumeResetSession(email, data.token);

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
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    const { error: qErr } = await supabaseAdmin
      .from("profiles")
      .update({
        recovery_question: data.newQuestion,
        recovery_answer_hash: makeStored(data.newAnswer),
        password_reset_required: false,
      })
      .eq("id", row.id);
    if (qErr) throw new Error(qErr.message);
    return { ok: true };
  });
