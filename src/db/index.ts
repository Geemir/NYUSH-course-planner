import "server-only";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "@/db/schema";

/**
 * Database client.
 *
 * - Production: set `DATABASE_URL` to a Postgres connection string (Neon /
 *   Supabase / any Postgres). Uses node-postgres over TCP.
 * - Local dev / tests: no `DATABASE_URL` → falls back to PGlite, an embedded
 *   Postgres that needs no server. Data persists under `.pglite/` (gitignored).
 *
 * Both speak the same Postgres SQL, so the Drizzle queries are identical.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzlePg(url, { schema });
  }
  const client = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
  return drizzlePglite(client, { schema });
}

// Reuse a single instance across hot reloads in dev to avoid exhausting
// connections / re-opening PGlite on every request.
const globalForDb = globalThis as unknown as {
  __plannerDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__plannerDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__plannerDb = db;

export { schema };
