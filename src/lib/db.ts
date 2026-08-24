import fs from "node:fs";
import path from "node:path";

/**
 * The data layer.
 *
 * Two backends behind one tiny interface:
 *
 *   DATABASE_URL set  → PostgreSQL over `pg`. This is Supabase in production.
 *   DATABASE_URL unset → PGlite, Postgres compiled to WASM, running in this
 *                        process against a local directory. Same engine and
 *                        the same SQL, so `npm run dev` and `npm test` need no
 *                        database server and still exercise real Postgres.
 *
 * Both are configured to hand back the same JavaScript shapes — see
 * TYPE_PARSERS. That matters more than it looks: `date` columns come back as
 * plain 'YYYY-MM-DD' strings rather than Date objects, so a due date can never
 * drift a day because the server happens to sit in a different timezone.
 */

export type Row = Record<string, unknown>;

export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

/* --------------------------------------------------------------- type OIDs */

const OID = {
  INT8: 20,
  NUMERIC: 1700,
  DATE: 1082,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
} as const;

const asString = (value: string) => value;
const asNumber = (value: string) => Number(value);

/**
 * Money is `numeric` in the schema, which both drivers return as a string to
 * protect precision they assume you need. Foundery's largest realistic figure
 * is a few crore, which a double holds exactly to the paisa, so parsing to a
 * number here keeps every downstream sum ordinary arithmetic.
 *
 * Ids and counts are `bigint` for the same reason and get the same treatment.
 */
const TYPE_PARSERS: Record<number, (value: string) => unknown> = {
  [OID.INT8]: asNumber,
  [OID.NUMERIC]: asNumber,
  [OID.DATE]: asString,
  [OID.TIMESTAMP]: asString,
  [OID.TIMESTAMPTZ]: asString,
};

/* ------------------------------------------------------------- connection */

declare global {
  var __founderyDb: Promise<Db> | undefined;
}

export function databaseUrl(): string | undefined {
  // Vercel's Supabase integration sets POSTGRES_URL; the Supabase dashboard
  // calls it DATABASE_URL. Accept either so neither has to be renamed.
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export function usingPostgresServer(): boolean {
  return Boolean(databaseUrl());
}

async function openPostgres(url: string): Promise<Db> {
  const { Pool, types } = await import("pg");

  for (const [oid, parser] of Object.entries(TYPE_PARSERS)) {
    types.setTypeParser(Number(oid), parser as (value: string) => string);
  }

  const pool = new Pool({
    connectionString: url,
    // Serverless: many short-lived instances, each wanting very few
    // connections. Supabase's transaction pooler multiplexes the rest.
    max: Number(process.env.FOUNDERY_DB_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: sslOptions(url),
  });

  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pool.query(text, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
  };
}

/**
 * Supabase terminates TLS with its own CA. Paste that certificate into
 * FOUNDERY_DB_CA_CERT and the chain is verified properly. Without it the
 * connection is still encrypted but the certificate isn't checked — which is
 * what `sslmode=require` means and what Supabase's own quickstarts use. Set
 * the certificate for anything you care about.
 */
function sslOptions(url: string): false | { ca?: string; rejectUnauthorized: boolean } {
  if (url.includes("sslmode=disable")) return false;
  const ca = process.env.FOUNDERY_DB_CA_CERT;
  if (ca) return { ca, rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

async function openPglite(): Promise<Db> {
  const dir = process.env.FOUNDERY_PGLITE_DIR || path.join(process.cwd(), ".pglite");

  let PGlite: typeof import("@electric-sql/pglite").PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch {
    // PGlite is a devDependency: it is the local convenience, not the product.
    // Reaching here in a deployed environment means DATABASE_URL never made it
    // into the environment, which is worth saying plainly.
    throw new Error(
      "No DATABASE_URL is set and PGlite isn't installed. Set DATABASE_URL to your " +
        "Supabase transaction-pooler connection string (see .env.example), or install " +
        "dev dependencies to use the local database.",
    );
  }

  const pg = new PGlite(dir === ":memory:" ? undefined : dir, { parsers: TYPE_PARSERS });
  await pg.waitReady;

  // Local backend, single process, no cold-start race: applying the schema on
  // open is the whole setup step. A server-backed database gets it from
  // `npm run db:setup` instead.
  await pg.exec(readSchema());

  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pg.query(text, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
  };
}

export function readSchema(): string {
  return fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
}

/**
 * One connection per process, cached on globalThis so Next's dev-mode module
 * reloading doesn't open a new pool on every request.
 */
export function getDb(): Promise<Db> {
  if (!globalThis.__founderyDb) {
    const url = databaseUrl();
    globalThis.__founderyDb = url ? openPostgres(url) : openPglite();
  }
  return globalThis.__founderyDb;
}

/* ----------------------------------------------------------- named params */

/**
 * Turns `@name` placeholders into `$1, $2, …` and lines the values up.
 *
 * Postgres only takes positional parameters, and hand-numbering a sixteen
 * column INSERT is exactly the kind of thing that silently writes the notes
 * into the currency field. Naming them keeps the statement readable and the
 * mapping impossible to get wrong.
 */
export function named(text: string, params: Record<string, unknown>): [string, unknown[]] {
  const values: unknown[] = [];
  const positions = new Map<string, number>();

  const compiled = text.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, key: string) => {
    if (!(key in params)) throw new Error(`Missing bind parameter: @${key}`);
    let position = positions.get(key);
    if (position === undefined) {
      values.push(params[key]);
      position = values.length;
      positions.set(key, position);
    }
    return `$${position}`;
  });

  return [compiled, values];
}

/* -------------------------------------------------------------- utilities */

export async function logAudit(
  actor: string,
  action: string,
  entity?: string,
  entityId?: string | number,
  detail?: string,
) {
  const db = await getDb();
  await db.query(
    `INSERT INTO foundery.audit_log (actor, action, entity, entity_id, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [actor, action, entity ?? null, entityId?.toString() ?? null, detail ?? null],
  );
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  const db = await getDb();
  const rows = await db.query<{ value: string }>(
    `SELECT value FROM foundery.settings WHERE key = $1`,
    [key],
  );
  return rows[0]?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.query(
    `INSERT INTO foundery.settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/** Every setting in one round trip, for code that needs several at once. */
export async function getSettings(): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.query<{ key: string; value: string }>(
    `SELECT key, value FROM foundery.settings`,
  );
  return new Map(rows.map((row) => [row.key, row.value]));
}
