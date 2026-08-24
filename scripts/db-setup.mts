/**
 * Applies db/schema.sql to whatever DATABASE_URL points at.
 *
 * Run this once against a new Supabase project, and again after any schema
 * change — the file is idempotent, so re-running it is safe. The app itself
 * never issues DDL: two serverless instances cold-starting at the same moment
 * would race on it, and a migration is a deliberate act, not a side effect of
 * a page load.
 */
import { getDb, readSchema, databaseUrl } from "../src/lib/db";

const url = databaseUrl();
console.log(
  url
    ? `Applying db/schema.sql to ${url.replace(/:\/\/[^@]*@/, "://***@")}`
    : "No DATABASE_URL set — applying db/schema.sql to the local PGlite database.",
);

const db = await getDb();
await db.exec(readSchema());

const tables = await db.query<{ table_name: string }>(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'foundery' ORDER BY table_name`,
);

console.log(`Ready. ${tables.length} tables in the foundery schema:`);
for (const table of tables) console.log(`  · ${table.table_name}`);
process.exit(0);
