"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, issueToken, roleForPasscode, type Role } from "@/lib/auth";
import { anonSupabase, identityConfigured, roleForEmail } from "@/lib/identity";
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
 * Step 1 of the email flow: a 6-digit code, sent only to an email that is on
 * a list. Checking the list BEFORE sending matters twice over — a stranger's
 * address never receives mail from us, and the failure is honest ("this
 * email isn't on the team") instead of a code that can never work.
 */
export async function sendLoginCode(_prev: OtpState, form: FormData): Promise<OtpState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "Enter your email address." };
  if (!identityConfigured()) return { error: "Sign-in isn't configured on this deployment." };

  if (!roleForEmail(email)) {
    await logAudit("public", "sign_in_denied", "email", undefined, email);
    return { error: "That email isn't on the team. Ask the founder to add you in the settings." };
  }

  const { error } = await anonSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) return { error: `Couldn't send the code: ${error.message}` };

  return { sentTo: email };
}

/** Step 2: the code comes back, Supabase verifies it, the role cookie is minted. */
export async function verifyLoginCode(_prev: OtpState, form: FormData): Promise<OtpState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { sentTo: email, error: "Enter the 6-digit code from the email." };

  const { data, error } = await anonSupabase().auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error || !data.user?.email) {
    return { sentTo: email, error: "That code didn't match — check it, or request a fresh one." };
  }

  // The role decision uses the email Supabase verified, never the form's.
  const role = roleForEmail(data.user.email);
  if (!role) {
    await logAudit("public", "sign_in_denied", "email", undefined, data.user.email);
    return { error: "That email isn't on the team." };
  }

  await grantSession(role);
  await logAudit(role, "sign_in", "method", undefined, "email_otp");
  redirect("/");
}
