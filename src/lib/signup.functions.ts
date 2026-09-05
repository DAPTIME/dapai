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
    /* Never seed a display name from the email address. The name reaches
       public places — the track leaderboard, the member list of a study
       room — so defaulting it to the half of an address before the @ put
       what is usually a real name in front of strangers, for someone who
       simply left the optional Name field blank. An empty name is left
       empty; the places that show one supply their own neutral label. */
    const name = data.name?.trim() || "";

    const { consumeEmailQuota } = await import("./rate-limit.server");
    await consumeEmailQuota("signup", email);

    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.password);

    /* ── Fallback: no service-role key on this deployment ─────────────────
       The primary path below is built on admin APIs — find the user, mint a
       confirmation link, write the recovery question, send through Resend.
       Without SUPABASE_SERVICE_ROLE_KEY every one of those throws, and the
       thrown message (an environment dump) was landing in the signup toast.

       Plain auth.signUp with the publishable key needs no admin rights:
       Supabase creates the unconfirmed account and sends its own
       confirmation email. The name and the recovery question travel in the
       user metadata — the answer as the same salted hash the primary path
       stores, never plaintext — and a database trigger copies them onto the
       profile row. The moment the key is configured, the branded Resend
       path below takes over again, unchanged. */
    const { hasAdminEnv } = await import("./admin-client.server");
    if (!hasAdminEnv()) {
      const { makeStored } = await import("./recovery-hash.server");
      const { createClient } = await import("@supabase/supabase-js");
      const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import(
        "@/integrations/supabase/public-config"
      );
      const plain = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { resolveSiteUrl } = await import("./site-url.server");
      const siteUrl = resolveSiteUrl(data.origin);
      const { error } = await plain.auth.signUp({
        email,
        password: data.password,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback`,

          data: {
            name,
            recovery_question: data.question,
            recovery_answer_hash: makeStored(data.answer),
          },
        },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists")) {
          throw new Error(
            "An account with this email already exists. Try signing in instead."
          );
        }
        if (msg.includes("rate limit")) {
          throw new Error(
            "Too many signups right now. Please try again in a little while."
          );
        }
        if (msg.includes("for security purposes")) {
          // GoTrue's send cooldown ("you can only request this after N
          // seconds") — matches neither "rate limit" nor the mailer error,
          // so it fell to the generic message in live testing.
          throw new Error(
            "Please wait a minute before trying to sign up again."
          );
        }
        if (msg.includes("sending confirmation email")) {
          // Supabase's own mailer is not configured for this project — the
          // branded Resend path exists precisely because of that, and it
          // needs the service-role key. Nothing keyless can send the
          // confirmation, so say what the visitor can actually do.
          throw new Error(
            "Signups are temporarily unavailable while we fix our email delivery. Please try again later."
          );
        }
        console.error("[signup] fallback signUp failed:", error.message);
        throw new Error(
          "We couldn't start your signup right now. Please try again in a minute."
        );
      }
      return { ok: true, pending: true };
    }

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

    // The greeting in the person's own confirmation email may fall back to
    // their address — it is going to them, and reveals nothing they do not
    // already know. Only the stored profile name is kept empty.
    await deliverConfirmation({
      email,
      name: name || email.split("@")[0] || "there",
      link,
      origin: data.origin,
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
    const { hasAdminEnv } = await import("./admin-client.server");
    if (!hasAdminEnv()) {
      // Same key-less fallback as registerAccount: let Supabase re-send its
      // own confirmation email. Errors are swallowed into the same "ok"
      // shape the primary path uses, which never reveals whether the
      // address exists.
      const { createClient } = await import("@supabase/supabase-js");
      const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import(
        "@/integrations/supabase/public-config"
      );
      const plain = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { resolveSiteUrl } = await import("./site-url.server");
      const { error } = await plain.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${resolveSiteUrl(data.origin)}/auth/callback`,
        },
      });

      if (error) console.warn("[signup] fallback resend failed:", error.message);
      return { ok: true };
    }

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

