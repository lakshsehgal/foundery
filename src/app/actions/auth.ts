"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, issueToken, roleForPasscode, type Role } from "@/lib/auth";
import { teamRoleForEmail } from "@/lib/identity";
import { createLoginCode, consumeLoginCode } from "@/lib/login-codes";
import { getResendConfig, loginCodeEmail, sendEmail } from "@/lib/resend";
import { logAudit } from "@/lib/db";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const passcode = String(formData.get("passcode") ?? "");
  if (!passcode) return { error: "Enter your passcode." };

  const role = roleForPasscode(passcode);
  if (!role) {
    logAudit("public", "sign_in_failed");
    return { error: "That passcode doesn't match. Check the case and try again." };
  }

  const jar = await cookies();
  jar.set(COOKIE_NAME, issueToken(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  logAudit(role, "sign_in");
  redirect("/");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  redirect("/login");
}

/* ---------------------------------------------------- passwordless sign-in */

export async function grantSession(role: Role) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, issueToken(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export type OtpState = { error?: string; sentTo?: string };

/**
 * Step 1 of the email flow: a 6-digit code, generated and stored by Cortex
 * and delivered by Resend — the email contains the code itself, never a
 * link, so there is no redirect chain to break. The team list is checked
 * BEFORE sending: a stranger's address never receives mail, and the failure
 * is honest ("this email isn't on the team") instead of a dead code.
 */
export async function sendLoginCode(_prev: OtpState, form: FormData): Promise<OtpState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "Enter your email address." };

  if (!(await teamRoleForEmail(email))) {
    await logAudit("public", "sign_in_denied", "email", undefined, email);
    return { error: "That email isn't on the team. Ask the founder to add you in the settings." };
  }

  const resend = await getResendConfig();
  if (!resend) {
    return {
      error:
        "Email codes aren't set up yet — the founder needs to add the Resend API key (Settings → Email, or RESEND_API_KEY in Vercel).",
    };
  }

  const created = await createLoginCode(email);
  if ("error" in created) return { error: created.error };

  const message = loginCodeEmail(created.code);
  const delivery = await sendEmail(resend, email, message.subject, message.html);
  if (!delivery.ok) return { error: `Couldn't send the code: ${delivery.error}` };

  return { sentTo: email };
}

/** Step 2: the code comes back, Cortex verifies it, the role cookie is minted. */
export async function verifyLoginCode(_prev: OtpState, form: FormData): Promise<OtpState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { sentTo: email, error: "Enter the 6-digit code from the email." };

  const verified = await consumeLoginCode(email, code);
  if (!verified) {
    return { sentTo: email, error: "That code didn't match or has expired — request a fresh one." };
  }

  // Owning the inbox is the proof; the role comes from the team list.
  const role = await teamRoleForEmail(email);
  if (!role) {
    await logAudit("public", "sign_in_denied", "email", undefined, email);
    return { error: "That email isn't on the team." };
  }

  await grantSession(role);
  await logAudit(role, "sign_in", "method", undefined, "email_code");
  redirect("/");
}
