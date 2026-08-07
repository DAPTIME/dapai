/**
 * Email sending through the Lovable connector gateway (Resend).
 * Server-only: reads LOVABLE_API_KEY and RESEND_API_KEY.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

/** Sender address. Override with the RESEND_FROM secret once a domain is verified. */
export function senderAddress() {
  return process.env["RESEND_FROM"] || "DAP AI <onboarding@resend.dev>";
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: senderAddress(),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
      reply_to: opts.replyTo || "DAPAI.support@gmail.com",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[email] Resend request failed [${res.status}]: ${body}`);
    throw new Error(`Email send failed [${res.status}]: ${body}`);
  }
  return (await res.json()) as { id?: string };
}

/** Branded DAP AI confirmation email. */
export function confirmEmailHtml(opts: { name: string; link: string }) {
  const name = escapeHtml(opts.name || "there");
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;padding:10px 18px;border-radius:14px;background:linear-gradient(135deg,#6366f1,#a855f7);color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.5px;">DAP AI</div>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(16,24,40,.08);">
      <h1 style="margin:0 0 12px;font-size:22px;color:#101828;">Confirm your DAP AI account</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475467;">
        Hi ${name}, thanks for signing up. Your account is on hold until you confirm this email address.
        Tap the button below and you're in.
      </p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${opts.link}" style="display:inline-block;padding:14px 26px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#a855f7);color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">Confirm my account</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#667085;">
        This link expires in 10 minutes. If it does, just sign up again and we'll send a fresh one.
      </p>
      <p style="margin:0;font-size:13px;color:#667085;word-break:break-all;">
        Button not working? Paste this into your browser:<br /><a href="${opts.link}" style="color:#6366f1;">${opts.link}</a>
      </p>
    </div>
    <p style="text-align:center;margin:20px 0 0;font-size:12px;color:#98a2b3;">
      You received this because someone signed up for DAP AI with this address.<br />
      If that wasn't you, you can safely ignore it.
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
