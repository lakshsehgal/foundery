import crypto from "node:crypto";

/**
 * The security core: passcodes in, a signed role token out, and back again.
 *
 * Deliberately free of any framework import so it can be exercised directly
 * by the test suite — the part of the app most worth testing shouldn't need a
 * request, a router or a browser to run.
 */

export type Role = "founder" | "operator";

export const COOKIE_NAME = "foundery_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h

export function sessionSecret(): string {
  return process.env.FOUNDERY_SESSION_SECRET || "dev-only-insecure-secret-change-me";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/**
 * Constant-time comparison that tolerates a length mismatch. Hashing both
 * sides first keeps the buffers equal-length, so timingSafeEqual can't throw
 * and the comparison leaks nothing about how long the real passcode is.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function issueToken(role: Role, now = Date.now()): string {
  const payload = `${role}.${now + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/** The role a token proves, or null if it proves nothing. */
export function verifyToken(token: string | undefined, now = Date.now()): Role | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [role, expiry, mac] = parts;

  // The signature covers the role, so a token can't be edited into a
  // higher-privilege one without the secret.
  if (!safeEqual(sign(`${role}.${expiry}`), mac)) return null;
  if (!/^\d+$/.test(expiry) || Number(expiry) < now) return null;
  if (role !== "founder" && role !== "operator") return null;
  return role;
}

/** Which passcode, if any, matches. Founder is checked first. */
export function roleForPasscode(passcode: string): Role | null {
  const founder = process.env.FOUNDERY_FOUNDER_PASSCODE || "";
  const operator = process.env.FOUNDERY_OPERATOR_PASSCODE || "";
  if (founder && safeEqual(passcode, founder)) return "founder";
  if (operator && safeEqual(passcode, operator)) return "operator";
  return null;
}

/**
 * A shareable onboarding token. Random, not derived from the row id, so one
 * public link can never be guessed from another.
 */
export function newPublicToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}
