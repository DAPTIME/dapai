import { dbError } from "./db-error";
/** Server-only helpers for the confirm-your-email signup flow. */
import { sendEmail, confirmEmailHtml } from "./email.server";
import { resolveSiteUrl } from "./site-url.server";

export const HOLD_MS = 10 * 60 * 1000;

export async function findUserByEmail(email: string) {
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
  if (error) throw dbError(error);
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
      throw e;
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: opts.email,
      options: { redirectTo: `${resolveSiteUrl(opts.origin)}/?confirmed=1` },
    });
    if (error) throw dbError(error);
    link = data?.properties?.action_link;
  }
  if (!link) throw new Error("Could not create a confirmation link.");

  await deliverConfirmation({ email: opts.email, name: opts.name, link });
}
