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
  if (error) throw new Error(error.message);
  const link = data?.properties?.action_link;
  if (!link) throw new Error("Could not create a confirmation link.");
  return link;
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
