import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Each test file gets its own PGlite database, created before any module that
 * touches it is imported — db.ts resolves the location once, at first open,
 * and caches the connection on globalThis.
 *
 * PGlite is Postgres, so these tests exercise the same engine and the same SQL
 * that runs against Supabase — no server, no fixture container, no dialect
 * gap between what is tested and what ships.
 */
export function setupTempDb(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `foundery-${name}-`));
  process.env.FOUNDERY_PGLITE_DIR = dir;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  process.env.FOUNDERY_CURRENCY = "INR";
  process.env.FOUNDERY_SESSION_SECRET = "test-secret";
  process.env.FOUNDERY_FOUNDER_PASSCODE = "founder-pass";
  process.env.FOUNDERY_OPERATOR_PASSCODE = "operator-pass";
  return dir;
}

export const TODAY = "2026-08-24";
