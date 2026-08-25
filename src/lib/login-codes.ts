import "server-only";
import crypto from "node:crypto";
import { getDb } from "./db";
import { sessionSecret } from "./session";

/**
 * Foundery's own one-time codes: generated here, hashed here, verified here.
 * The email provider only ever carries the code — no magic links, no
 * redirect chains, nothing that can break between inbox and sign-in page.
 */

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const SEND_WINDOW_MINUTES = 15;

function hashCode(email: string, code: string): string {
  return crypto
    .createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${sessionSecret()}`)
    .digest("hex");
}

export async function createLoginCode(
  email: string,
): Promise<{ code: string } | { error: string }> {
  const db = await getDb();
  const normalized = email.toLowerCase();

  try {
    const [recent] = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM foundery.login_codes
       WHERE email = $1 AND created_at > now() - interval '${SEND_WINDOW_MINUTES} minutes'`,
      [normalized],
    );
    if (recent.n >= MAX_SENDS_PER_WINDOW) {
      return { error: "Too many codes requested — wait a few minutes and try again." };
    }

    const code = String(crypto.randomInt(100000, 1000000));
    // One live code per email: a new request invalidates the old code.
    await db.query(`DELETE FROM foundery.login_codes WHERE email = $1 AND expires_at < now()`, [
      normalized,
    ]);
    await db.query(
      `INSERT INTO foundery.login_codes (email, code_hash, expires_at)
       VALUES ($1, $2, now() + interval '${CODE_TTL_MINUTES} minutes')`,
      [normalized, hashCode(normalized, code)],
    );
    return { code };
  } catch {
    return {
      error:
        "The sign-in tables aren't in the database yet — run db/schema.sql against it once (Supabase SQL editor).",
    };
  }
}

export async function consumeLoginCode(email: string, code: string): Promise<boolean> {
  const db = await getDb();
  const normalized = email.toLowerCase();

  try {
    const matches = await db.query<{ id: number }>(
      `SELECT id FROM foundery.login_codes
       WHERE email = $1 AND code_hash = $2 AND expires_at > now() AND attempts < ${MAX_ATTEMPTS}`,
      [normalized, hashCode(normalized, code)],
    );
    if (matches.length > 0) {
      await db.query(`DELETE FROM foundery.login_codes WHERE email = $1`, [normalized]);
      return true;
    }
    await db.query(
      `UPDATE foundery.login_codes SET attempts = attempts + 1 WHERE email = $1`,
      [normalized],
    );
    return false;
  } catch {
    return false;
  }
}
