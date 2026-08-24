import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Each test file gets its own SQLite file, created before any module that
 * touches the database is imported — db.ts resolves the path once, at first
 * open, and caches the handle on globalThis.
 */
export function setupTempDb(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `foundery-${name}-`));
  const file = path.join(dir, "test.db");
  process.env.FOUNDERY_DB_PATH = file;
  process.env.FOUNDERY_CURRENCY = "INR";
  process.env.FOUNDERY_SESSION_SECRET = "test-secret";
  process.env.FOUNDERY_FOUNDER_PASSCODE = "founder-pass";
  process.env.FOUNDERY_OPERATOR_PASSCODE = "operator-pass";
  return file;
}

export const TODAY = "2026-08-24";
