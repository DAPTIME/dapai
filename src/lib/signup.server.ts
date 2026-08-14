import { dbError } from "./db-error";
/** Server-only helpers for the confirm-your-email signup flow. */
import { sendEmail, confirmEmailHtml } from "./email.server";
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
 * Deliver the confirmation email. Resend is the primary sender; if Resend
 * refuses the recipient (e.g. the shared onboarding sender can only reach the
 * account owner until a domain is verified), fall back to Supabase's own
 * built-in confirmation email so signup never dead-ends.
 */
export async function deliverConfirmation(opts: {
  email: string;
  name: string;
  link: string;
}) {
  try {
    await sendEmail({
      to: opts.email,
      subject: "Confirm your DAP AI account",
      html: confirmEmailHtml({ name: opts.name, link: opts.link }),
      text: `Confirm your DAP AI account: ${opts.link} (expires in 10 minutes)`,
    });
    return { via: "resend" as const };
  } catch (e) {
    console.error("[signup] Resend delivery failed, falling back to Supabase:", (e as Error).message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resend({
      type: "signup",
      email: opts.email,
    });
    if (error) {
      console.error("[signup] Supabase fallback failed:", error.message);
      throw new Error(
        "We couldn't send your confirmation email right now. Please try again in a minute, or contact DAPAI.support@gmail.com."
      );
    }
    return { via: "supabase" as const };
  }
}

export async function sendConfirmation(opts: {
  email: string;
  name: string;
  origin: string;
  password?: string;
}) {
  let link: string | undefined;
  if (opts.password) {
    link = await generateSignupLink({
      email: opts.email,
      password: opts.password,
      name: opts.name,
      origin: opts.origin,
    });
  } else {
    // Existing unconfirmed users must use Supabase's resend operation.
    // generateLink({ type: "magiclink" }) is a sign-in link, not an email
    // confirmation link, and can leave the account in the wrong state.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resend({
      type: "signup",
      email: opts.email,
      options: { emailRedirectTo: `${resolveSiteUrl(opts.origin)}/?confirmed=1` },
    });
    if (error) throw dbError(error);
    return;
  }
  if (!link) throw new Error("Could not create a confirmation link.");

  await deliverConfirmation({ email: opts.email, name: opts.name, link });
}
