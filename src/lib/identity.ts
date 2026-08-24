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
 * The role a verified email carries, or null for "not yours to enter".
 * The founder's own address is the default so the very first deploy is
 * enterable before any list is configured.
 */
export function roleForEmail(email: string): Role | null {
  const normalized = email.trim().toLowerCase();
  const founders = parseList(process.env.FOUNDERY_FOUNDER_EMAILS || "laksh@neuroidmedia.com");
  const operators = parseList(process.env.FOUNDERY_OPERATOR_EMAILS);
  if (founders.includes(normalized)) return "founder";
  if (operators.includes(normalized)) return "operator";
  return null;
}
