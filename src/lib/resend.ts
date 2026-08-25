import "server-only";
import { getSettings } from "./db";

/**
 * Email, through Resend.
 *
 * The key comes from the environment when set, else from the settings table —
 * environment first, then the settings table, so the founder can connect it
 * from the Settings page without a redeploy.
 * The from-address must belong to a domain verified in Resend; until one is,
 * Resend's own `onboarding@resend.dev` works but only delivers to the Resend
 * account owner's address.
 */

export type ResendConfig = { apiKey: string; from: string };

export async function getResendConfig(): Promise<ResendConfig | null> {
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM || "Cortex <onboarding@resend.dev>",
    };
  }
  const settings = await getSettings();
  const apiKey = settings.get("resend_api_key");
  if (!apiKey) return null;
  return {
    apiKey,
    from: settings.get("resend_from") || "Cortex <onboarding@resend.dev>",
  };
}

export async function sendEmail(
  config: ResendConfig,
  to: string,
  subject: string,
  html: string,
  cc: string[] = [],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [to],
      ...(cc.length > 0 ? { cc } : {}),
      subject,
      html,
    }),
  });

  if (response.ok) return { ok: true };

  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return {
    ok: false,
    error:
      body?.message ??
      `Resend returned HTTP ${response.status} — check the API key and that the from-address domain is verified.`,
  };
}

/**
 * The sender for payment reminders — the accounts desk, not the app.
 * Overridable via the accounts_from settings row; the domain must be
 * verified in Resend for delivery to work.
 */
export async function accountsFrom(): Promise<string> {
  const settings = await getSettings();
  return settings.get("accounts_from") || "Neuroid Accounts <noreply@neuroidmedia.com>";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The payment check-in. Written like a person, on purpose: plain paragraphs,
 * no logo block, no buttons, no marketing furniture — templated mail gets
 * filed as noise, a short human note gets answered.
 */
export function paymentReminderEmail(input: {
  brand: string;
  amount: string;
  invoiceNumbers: string;
  monthLabel: string;
}): { subject: string; html: string } {
  const brand = escapeHtml(input.brand.trim());
  const amount = escapeHtml(input.amount.trim());
  const numbers = escapeHtml(input.invoiceNumbers.trim());
  const month = escapeHtml(input.monthLabel.trim());

  const invoiceLine = numbers
    ? `invoice ${numbers}${month ? ` for ${month}` : ""}`
    : `our ${month || "latest"} invoice`;

  const paragraph = (text: string) =>
    `<p style="margin:0 0 14px;color:#1f2430;font-size:14px;line-height:1.65;">${text}</p>`;

  return {
    subject: numbers
      ? `Checking in on invoice ${input.invoiceNumbers.trim()} — ${input.brand.trim()}`
      : `Checking in on our ${input.monthLabel.trim()} invoice — ${input.brand.trim()}`,
    html: `
<div style="margin:0;padding:8px 4px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${paragraph(`Hi ${brand} team,`)}
  ${paragraph(
    `Hope things are going well on your side. Just checking in on ${invoiceLine}${
      amount ? ` (${amount})` : ""
    } — it's still showing as pending at our end, so I wanted to see where it stands.`,
  )}
  ${paragraph(
    `If it's already been processed, please ignore this — these things cross over all the time. And if something's holding it up (an approval, a portal step, anything missing from us), just reply here and we'll sort it out.`,
  )}
  ${paragraph(`Thanks!`)}
  <p style="margin:0;color:#1f2430;font-size:14px;line-height:1.65;">
    Accounts<br />
    <span style="color:#6b7280;">Neuroid Media</span>
  </p>
</div>`,
  };
}

/**
 * The login-code email. Inline styles only, no images, no webfonts — the
 * masthead is type, so it renders identically everywhere including clients
 * that block remote content.
 */
export function loginCodeEmail(code: string): { subject: string; html: string } {
  return {
    subject: `${code} is your Cortex sign-in code`,
    html: `
<div style="margin:0;padding:32px 16px;background:#f6f7fb;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;margin:0 auto;">
    <tr><td style="padding:0 4px 14px;">
      <span style="display:inline-block;background:#FEEF24;color:#111111;font-weight:800;font-size:14px;letter-spacing:0.08em;padding:6px 10px;border-radius:6px;">NEUROID</span>
      <span style="color:#4d5563;font-size:13px;margin-left:8px;">Cortex</span>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e4e7ee;border-radius:12px;padding:28px;">
      <p style="margin:0;color:#14181f;font-size:15px;font-weight:600;">Your sign-in code</p>
      <p style="margin:8px 0 20px;color:#4d5563;font-size:13px;line-height:1.5;">
        Type this into the Cortex sign-in page. It works for 10 minutes.
      </p>
      <p style="margin:0;text-align:center;background:#f7f8fa;border:1px solid #e4e7ee;border-radius:8px;padding:16px 0;font-size:30px;font-weight:800;letter-spacing:0.28em;color:#14181f;font-variant-numeric:tabular-nums;">${code}</p>
      <p style="margin:20px 0 0;color:#8892a2;font-size:12px;line-height:1.5;">
        Didn't try to sign in? Ignore this email — nothing happens without the code.
      </p>
    </td></tr>
    <tr><td style="padding:14px 4px 0;color:#8892a2;font-size:11px;">Neuroid Media · Cortex</td></tr>
  </table>
</div>`,
  };
}
