import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession, verifyToken, type Role, type Session } from "./session";

/**
 * Request-scoped glue over lib/session. Everything here needs a request;
 * everything that doesn't lives in lib/session so it stays testable.
 */

export type { Role, Session };
export {
  COOKIE_NAME, issueSession, issueToken, newPublicToken, roleForPasscode, safeEqual,
  sessionSecret, verifySession, verifyToken,
} from "./session";

/** Current role, or null when signed out. Safe to call anywhere on the server. */
export async function currentRole(): Promise<Role | null> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE_NAME)?.value);
}

/** Role plus who signed in (null email for passcode sessions). */
export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE_NAME)?.value);
}

/** Require any signed-in role; bounces to /login otherwise. */
export async function requireRole(): Promise<Role> {
  const role = await currentRole();
  if (!role) redirect("/login");
  return role;
}

/** Require the founder role; operators get a clear "not for you" screen. */
export async function requireFounder(): Promise<Role> {
  const role = await requireRole();
  if (role !== "founder") redirect("/denied");
  return role;
}

export function isFounder(role: Role | null): boolean {
  return role === "founder";
}
