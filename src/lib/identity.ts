import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Role } from "./session";

/**
 * Sign-in without passwords.
 *
 * Supabase Auth does the identity ceremony — Google OAuth or a 6-digit email
 * code — and this module answers the only question Foundery actually has:
 * which verified email is this, and is it on a list? Once verified, the
 * ordinary signed role cookie is minted (see actions/auth.ts) and everything
 * downstream — requireRole, requireFounder, the policy layer — is untouched.
 *
 * Who gets in is an allowlist in the environment, not a table: two lists of
 * emails, founder and operator. An email on neither list is turned away by
 * name. There is no sign-up.
 */

export function identityConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabaseAnonKey(): string | undefined {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    undefined
  );
}

/** A fresh, session-less client: right for OTP send/verify on the server. */
export function anonSupabase() {
  return createClient(supabaseUrl()!, supabaseAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The role a verified email carries, from the environment lists only.
 * The founder's own address is the default so the very first deploy is
 * enterable before anything is configured.
 */
export function roleForEmail(email: string): Role | null {
  const normalized = email.trim().toLowerCase();
  const founders = parseList(process.env.FOUNDERY_FOUNDER_EMAILS || "laksh@neuroidmedia.com");
  const operators = parseList(process.env.FOUNDERY_OPERATOR_EMAILS);
  if (founders.includes(normalized)) return "founder";
  if (operators.includes(normalized)) return "operator";
  return null;
}

/**
 * The full answer: the team table managed on /settings first, the
 * environment lists as the bootstrap fallback beneath it. The fallback is
 * what makes lock-out impossible — an empty or missing table still lets the
 * founder in through the environment default.
 */
export async function teamRoleForEmail(email: string): Promise<Role | null> {
  const normalized = email.trim().toLowerCase();
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    const rows = await db.query<{ role: string }>(
      `SELECT role FROM foundery.team_members WHERE lower(email) = $1`,
      [normalized],
    );
    const role = rows[0]?.role;
    if (role === "founder" || role === "operator") return role;
  } catch {
    // Table not created yet — the environment fallback below still answers.
  }
  return roleForEmail(normalized);
}
