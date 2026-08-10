/**
 * Sign-up with email confirmation.
 *
 * Accounts are created unconfirmed ("on hold"). A branded DAP AI confirmation
 * email is sent through Resend. Any unconfirmed account older than 10 minutes
 * is purged, so the address is free to sign up again.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z
          .string()
          .trim()
          .email({ message: "Please enter a valid email address." })
          .max(255),
        password: z
          .string()
          .min(6, { message: "Password must be at least 6 characters." })
          .max(200),
        name: z.string().trim().max(80).optional(),
        question: z.string().trim().min(3).max(200),
        answer: z.string().trim().min(2).max(200),
        origin: z.string().trim().url().max(300),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const name = data.name?.trim() || email.split("@")[0]!;

    const { consumeEmailQuota } = await import("./rate-limit.server");
    await consumeEmailQuota("signup", email);

    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.password);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { makeStored } = await import("./recovery-hash.server");
    const { sendEmail, confirmEmailHtml } = await import("./email.server");
    const { HOLD_MS, findUserByEmail, generateSignupLink, sendConfirmation } =
      await import("./signup.server");

    const existing = await findUserByEmail(email);
    if (existing) {
      if (existing.confirmed) {
        throw new Error(
          "An account with this email already exists. Try signing in instead."
        );
      }
      if (Date.now() - existing.createdAt < HOLD_MS) {
        await sendConfirmation({
          email,
          name,
          origin: data.origin,
          password: data.password,
        });
        return { ok: true, pending: true };
      }
      await supabaseAdmin.auth.admin.deleteUser(existing.id);
    }

    const link = await generateSignupLink({
      email,
      password: data.password,
      name,
      origin: data.origin,
    });

    const created = await findUserByEmail(email);
    if (created) {
      await supabaseAdmin
        .from("profiles")
        .update({
          recovery_question: data.question,
          recovery_answer_hash: makeStored(data.answer),
        })
        .eq("id", created.id);
    }

    await sendEmail({
      to: email,
      subject: "Confirm your DAP AI account",
      html: confirmEmailHtml({ name, link }),
      text: `Hi ${name}, confirm your DAP AI account: ${link} (expires in 10 minutes)`,
    });

    return { ok: true, pending: true };
  });

export const resendConfirmationEmail = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z
          .string()
          .trim()
          .email({ message: "Please enter a valid email address." })
          .max(255),
        origin: z.string().trim().url().max(300),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { consumeEmailQuota } = await import("./rate-limit.server");
    await consumeEmailQuota("resend", email);
    const { findUserByEmail, sendConfirmation } = await import("./signup.server");
    const existing = await findUserByEmail(email);
    // Never reveal whether the address exists.
    if (!existing || existing.confirmed) return { ok: true };
    await sendConfirmation({
      email,
      name: existing.name || email.split("@")[0]!,
      origin: data.origin,
    });
    return { ok: true };
  });

export const getConfirmationState = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ email: z.string().trim().email().max(255) }).parse(i))
  .handler(async ({ data }) => {
    const { findUserByEmail } = await import("./signup.server");
    const existing = await findUserByEmail(data.email.toLowerCase());
    return { confirmed: !!existing?.confirmed };
  });
