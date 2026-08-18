import { dbError } from "./db-error";
/** Server-only helpers for the confirm-your-email signup flow. */
import { resolveSiteUrl } from "./site-url.server";

export const HOLD_MS = 10 * 60 * 1000;

export async function findUserByEmail(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const target = email.trim().toLowerCase();
  // listUsers is paginated — a single page can silently miss the account,
  // which used to make signup fail later with "email already registered".
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw dbError(error);
    const users = data?.users ?? [];
    const u = users.find((x) => (x.email ?? "").toLowerCase() === target);
    if (u) {
      return {
        id: u.id,
        confirmed: !!u.email_confirmed_at,
        createdAt: new Date(u.created_at).getTime(),
        name: (u.user_metadata?.["name"] as string | undefined) ?? "",
      };
    }
    if (users.length < 200) break;
  }
  return null;
}

/** True when Supabase rejected the signup because the address already exists. */
export function isEmailExists(e: unknown) {
  const msg = (e as { code?: string; message?: string });
  return (
    msg?.code === "email_exists" ||
    /already been registered|already registered|email_exists/i.test(
      msg?.message ?? ""
    )
  );
}

export async function generateSignupLink(opts: {
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
      redirectTo: `${resolveSiteUrl(opts.origin)}/?confirmed=1`,
    },
  });
  if (error) throw error;
  const link = data?.properties?.action_link;
  if (!link) throw new Error("Could not create a confirmation link.");
  return link;
}


/**
 * Deliver the branded DAP AI confirmation email ourselves, through Resend.
 *
 * Supabase Auth is deliberately NOT used to send it: generating the link is
 * already one auth-email operation, so asking Auth to send a second one
 * comes straight back as 429 over_email_send_rate_limit ("only after 59
 * seconds") — which is what used to surface as "something went wrong" on
 * every signup.
 */
export async function deliverConfirmation(opts: {
  email: string;
  name: string;
  link: string;
  origin?: string;
}) {
  const { sendEmail, confirmEmailHtml } = await import("./email.server");
  try {
    await sendEmail({
      to: opts.email,
      subject: "Confirm your DAP AI account",
      html: confirmEmailHtml({ name: opts.name, link: opts.link }),
      text: `Hi ${opts.name}, confirm your DAP AI account: ${opts.link}`,
    });
  } catch (e) {
    console.error("[signup] confirmation email failed:", (e as Error).message);
    throw new Error(
      (e as Error).message ||
        "Your account was created, but we couldn't send the confirmation email. " +
          "Use \u201cResend email\u201d in a minute, or contact DAPAI.support@gmail.com."
    );
  }
  return { via: "resend" as const };
}

export async function sendConfirmation(opts: {
  email: string;
  name: string;
  origin: string;
  password?: string;
}) {
  let link: string;
  if (opts.password) {
    link = await generateSignupLink({
      email: opts.email,
      password: opts.password,
      name: opts.name,
      origin: opts.origin,
    });
  } else {
    /* An existing unconfirmed address cannot get another `signup` link
       (Auth answers email_exists). A magic link verifies the same address
       and marks it confirmed, so it does the job — and it goes out through
       Resend like everything else, rather than Auth's SMTP. */
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: opts.email,
      options: { redirectTo: `${resolveSiteUrl(opts.origin)}/?confirmed=1` },
    });
    if (error) throw dbError(error);
    const generated = data?.properties?.action_link;
    if (!generated) throw new Error("Could not create a confirmation link.");
    link = generated;
  }

  await deliverConfirmation({
    email: opts.email,
    name: opts.name,
    link,
    origin: opts.origin,
  });
}
