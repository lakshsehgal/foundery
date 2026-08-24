import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Single SQLite connection, cached on globalThis so Next's dev-mode module
 * reloading doesn't open a new file handle on every request.
 */
declare global {
  var __founderyDb: Database.Database | undefined;
}

function resolveDbPath(): string {
  const configured = process.env.FOUNDERY_DB_PATH || "data/foundery.db";
  // The path is configurable at runtime, which the bundler's static analysis
  // reads as "could be anything" and answers by tracing the entire project —
  // public folder and all — into the server output. It is only ever a local
  // SQLite file, so opt out of the trace.
  return path.isAbsolute(configured)
    ? configured
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function open(): Database.Database {
  const file = resolveDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__founderyDb) globalThis.__founderyDb = open();
  return globalThis.__founderyDb;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'active',      -- active | paused | churned
  engagement     TEXT NOT NULL DEFAULT 'retainer',    -- retainer | one_time
  vip            INTEGER NOT NULL DEFAULT 0,
  services       TEXT NOT NULL DEFAULT '[]',          -- JSON array of service tags
  retainer_amount   REAL NOT NULL DEFAULT 0,          -- per month, founder-only
  one_time_value    REAL NOT NULL DEFAULT 0,          -- total contract, founder-only
  delivery_cost     REAL NOT NULL DEFAULT 0,          -- monthly cost to serve, founder-only
  currency       TEXT NOT NULL DEFAULT 'INR',
  start_date     TEXT,
  end_date       TEXT,
  billing_day    INTEGER NOT NULL DEFAULT 1,          -- day of month the invoice is raised
  terms_days     INTEGER NOT NULL DEFAULT 15,         -- net-N payment terms
  owner          TEXT,                                -- internal account owner
  health         TEXT NOT NULL DEFAULT 'green',       -- green | amber | red (founder-only)
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS costs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT NOT NULL,                         -- salary | tools | contractor | charity | marketing | other
  label        TEXT NOT NULL,                         -- what it is (role, tool name, campaign)
  person       TEXT,                                  -- named individual, if any (redacted from operator on salary)
  amount       REAL NOT NULL DEFAULT 0,
  cadence      TEXT NOT NULL DEFAULT 'monthly',       -- monthly | annual | one_time
  currency     TEXT NOT NULL DEFAULT 'INR',
  start_date   TEXT,
  end_date     TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  number       TEXT NOT NULL UNIQUE,
  period       TEXT,                                  -- e.g. '2026-08' or 'Phase 1'
  issue_date   TEXT NOT NULL,
  due_date     TEXT NOT NULL,
  terms_days   INTEGER NOT NULL DEFAULT 15,
  amount       REAL NOT NULL DEFAULT 0,
  amount_paid  REAL NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'INR',
  status       TEXT NOT NULL DEFAULT 'draft',         -- draft | sent | part_paid | paid | void
  paid_date    TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due    ON invoices(due_date);

CREATE TABLE IF NOT EXISTS onboarding_forms (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  intro        TEXT,
  token        TEXT NOT NULL UNIQUE,                  -- public URL segment
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  fields       TEXT NOT NULL DEFAULT '[]',            -- JSON array of field defs
  status       TEXT NOT NULL DEFAULT 'open',          -- open | closed
  created_by   TEXT NOT NULL DEFAULT 'founder',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id      INTEGER NOT NULL REFERENCES onboarding_forms(id) ON DELETE CASCADE,
  answers      TEXT NOT NULL DEFAULT '{}',            -- JSON object keyed by field key
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_submissions_form ON onboarding_submissions(form_id);

-- Money that actually landed / non-invoice income, per calendar month. Founder-only.
CREATE TABLE IF NOT EXISTS pnl_months (
  month          TEXT PRIMARY KEY,                    -- 'YYYY-MM'
  other_income   REAL NOT NULL DEFAULT 0,
  one_off_costs  REAL NOT NULL DEFAULT 0,
  tax_rate       REAL NOT NULL DEFAULT 0,             -- 0..1, applied to profit before tax
  notes          TEXT,
  closed         INTEGER NOT NULL DEFAULT 0,          -- month locked as final
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL DEFAULT (datetime('now')),
  actor      TEXT NOT NULL,                           -- founder | operator | public
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
`;

function migrate(db: Database.Database) {
  db.exec(SCHEMA);
}

export function logAudit(
  actor: string,
  action: string,
  entity?: string,
  entityId?: string | number | bigint,
  detail?: string,
) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(actor, action, entity ?? null, entityId?.toString() ?? null, detail ?? null);
}

export function getSetting(key: string, fallback: string): string {
  const row = getDb()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}
