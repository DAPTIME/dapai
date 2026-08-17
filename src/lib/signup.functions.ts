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
          .min(8, { message: "Password must be at least 8 characters." })
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
    const name = data.name?.trim() || email.split("@")[0] || "there";

    const { consumeEmailQuota } = await import("./rate-limit.server");
    await consumeEmailQuota("signup", email);

    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.password);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { makeStored } = await import("./recovery-hash.server");
    const {
      HOLD_MS,
      findUserByEmail,
      generateSignupLink,
      sendConfirmation,
      deliverConfirmation,
      isEmailExists,
    } = await import("./signup.server");

    const existing = await findUserByEmail(email);
    if (existing) {
      if (existing.confirmed) {
        throw new Error(
          "An account with this email already exists. Try signing in instead."
        );
      }
      // Supabase cannot generate another `signup` link for an existing
      // unconfirmed address; it returns email_exists. Recreate the held
      // account so this submission gets one fresh, valid confirmation link.
      // This also clears stale unconfirmed accounts left by a failed sender.
      await supabaseAdmin.auth.admin.deleteUser(existing.id);
    }

    let link: string;
    try {
      link = await generateSignupLink({
        email,
        password: data.password,
        name,
        origin: data.origin,
      });
    } catch (e) {
      if (!isEmailExists(e)) {
        console.error("[signup] link generation failed:", (e as Error).message);
        throw new Error(
          "We couldn't start your signup right now. Please try again in a minute."
        );
      }
      // The address exists after all (stale/unlisted account). Remove it when
      // it was never confirmed, then try once more; otherwise tell the user.
      const again = await findUserByEmail(email);
      if (again && !again.confirmed) {
        await supabaseAdmin.auth.admin.deleteUser(again.id);
        link = await generateSignupLink({
          email,
          password: data.password,
          name,
          origin: data.origin,
        });
      } else {
        throw new Error(
          "An account with this email already exists. Try signing in instead, or use “Forgot password”."
        );
      }
    }

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

    await deliverConfirmation({ email, name, link, origin: data.origin });

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
      name: existing.name || email.split("@")[0] || "there",
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
