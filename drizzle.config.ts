import { defineConfig } from "drizzle-kit";

// Dev uses PGlite (embedded). For a hosted Postgres, set DATABASE_URL and the
// driver/credentials below are ignored in favor of it.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(process.env.DATABASE_URL
    ? { dbCredentials: { url: process.env.DATABASE_URL } }
    : { driver: "pglite", dbCredentials: { url: process.env.PGLITE_DIR ?? ".pglite" } }),
});
