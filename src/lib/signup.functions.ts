/**
 * Sign-up with email confirmation.
 *
 * Accounts are created unconfirmed ("on hold"). A branded DAP AI confirmation
 * email is sent through Resend with a link that expires in 10 minutes. Any
 * unconfirmed account older than 10 minutes is purged so the address is free
 * to sign up again.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const HOLD_MS = 10 * 60 * 1000;

const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: "Please enter a valid email address." })
    .max(255),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }).max(200),
  name: z.string().trim().max(80).optional(),
  question: z.string().trim().min(3).max(200),
  answer: z.string().trim().min(2).max(200),
  origin: z.string().trim().url().max(300),
});

export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((i) => signupSchema.parse(i))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const name = data.name?.trim() || email.split("@")[0]!;

    const { assertPasswordNotLeaked } = await import("./pwned.server");
    await assertPasswordNotLeaked(data.password);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { makeStored } = await import("./recovery-hash.server");
    const { sendEmail, confirmEmailHtml } = await import("./email.server");

    // Free up any stale unconfirmed account for this address.
    const existing = await findUserByEmail(email);
    if (existing) {
      if (existing.confirmed) {
        throw new Error("An account with this email already exists. Try signing in instead.");
      }
      if (Date.now() - existing.createdAt < HOLD_MS) {
        // Still on hold — resend instead of duplicating.
        await sendConfirmation({ email, name, origin: data.origin, password: data.password });
        return { ok: true, pending: true as const };
      }
      await supabaseAdmin.auth.admin.deleteUser(existing.id);
    }

    const link = await generateSignupLink({
      email,
      password: data.password,
      name,
      origin: data.origin,
    });

    // Store the recovery question on the freshly created profile.
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

    return { ok: true, pending: true as const };
  });

export const resendConfirmationEmail = createServerFn({ method: "POST" })
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

/** Whether the signed-in-ish address still needs to confirm. */
export const getConfirmationState = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(i)
  )
  .handler(async ({ data }) => {
    const existing = await findUserByEmail(data.email.toLowerCase());
    return { confirmed: !!existing?.confirmed };
  });

// ── helpers (server-only, run inside handlers) ──────────────────────────

async function findUserByEmail(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => (x.email ?? "").toLowerCase() === email);
  if (!u) return null;
  return {
    id: u.id,
    confirmed: !!u.email_confirmed_at,
    createdAt: new Date(u.created_at).getTime(),
    name: (u.user_metadata?.["name"] as string | undefined) ?? "",
  };
}

async function generateSignupLink(opts: {
  email: string;
  password: string;
  name: string;
  origin: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email: opts.email,
    password: opts.password,
    options: {
      data: { name: opts.name },
      redirectTo: `${opts.origin}/?confirmed=1`,
    },
  });
  if (error) throw new Error(error.message);
  const link = data?.properties?.action_link;
  if (!link) throw new Error("Could not create a confirmation link.");
  return link;
}

async function sendConfirmation(opts: {
  email: string;
  name: string;
  origin: string;
  password?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmail, confirmEmailHtml } = await import("./email.server");

  let link: string | undefined;
  if (opts.password) {
    link = await generateSignupLink({
      email: opts.email,
      password: opts.password,
      name: opts.name,
      origin: opts.origin,
    });
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: opts.email,
      options: { redirectTo: `${opts.origin}/?confirmed=1` },
    });
    if (error) throw new Error(error.message);
    link = data?.properties?.action_link;
  }
  if (!link) throw new Error("Could not create a confirmation link.");

  await sendEmail({
    to: opts.email,
    subject: "Confirm your DAP AI account",
    html: confirmEmailHtml({ name: opts.name, link }),
    text: `Confirm your DAP AI account: ${link} (expires in 10 minutes)`,
  });
}
