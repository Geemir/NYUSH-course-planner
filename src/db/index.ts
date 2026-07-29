import "server-only";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
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
    // Explicit pool so we can (a) attach an `error` handler — an idle client
    // dropped by a flaky/remote host (e.g. Neon) otherwise emits an *unhandled*
    // 'error' event and crashes the process — and (b) keep sockets alive to
    // reduce mid-session drops.
    const pool = new Pool({
      connectionString: url,
      keepAlive: true,
      connectionTimeoutMillis: 20_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (error) => {
      console.error("[db] idle Postgres client error:", error.message);
    });
    return drizzlePg(pool, { schema });
  }
  const client = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
  return drizzlePglite(client, { schema });
}

// Reuse a single instance across hot reloads in dev to avoid exhausting
// connections / re-opening PGlite on every request.
const globalForDb = globalThis as unknown as {
  __plannerDb?: ReturnType<typeof createDb>;
};

function buildTimeDb(): ReturnType<typeof createDb> {
  // Auth.js inspects the Drizzle dialect while Next collects route metadata.
  // A real node-postgres Drizzle object satisfies that inspection, while the
  // unreachable loopback URL prevents accidental dependence on build data.
  return drizzlePg("postgresql://build:build@127.0.0.1:1/build", { schema });
}

const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
export const db = isProductionBuild
  ? buildTimeDb()
  : globalForDb.__plannerDb ?? createDb();
if (!isProductionBuild && process.env.NODE_ENV !== "production") {
  globalForDb.__plannerDb = db;
}

export { schema };
