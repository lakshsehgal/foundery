"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, issueToken, roleForPasscode } from "@/lib/auth";
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
