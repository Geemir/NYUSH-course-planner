/**
 * Preflight guard for CLI scripts that open the local database.
 *
 * PGlite (local dev) is single-process: running a script while `npm run dev`
 * holds the `.pglite` directory opens a second connection and CORRUPTS the
 * datadir (the dreaded `RuntimeError: Aborted()`). Call this BEFORE importing
 * `@/db` — dynamically — so nothing opens a connection until the check passes:
 *
 *   import { assertDatabaseUnlocked } from "./lib/preflight-db-lock";
 *   async function main() {
 *     await assertDatabaseUnlocked();
 *     const { db } = await import("@/db");
 *     ...
 *   }
 *
 * It detects the live dev server by probing the project's likely ports rather
 * than the `.pglite` lock file, because scripts that exit via `process.exit`
 * routinely leave a STALE postmaster.pid that does not block a fresh open — so
 * lock-file presence would false-positive constantly.
 *
 * No effect with DATABASE_URL (real Postgres) or ALLOW_DB_LOCK=1 (force).
 */
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function candidatePorts(): number[] {
  const ports = new Set<number>([3000, 3456]);
  try {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), ".claude/launch.json"), "utf8"),
    ) as { configurations?: { port?: number }[] };
    for (const entry of config.configurations ?? []) {
      if (typeof entry.port === "number") ports.add(entry.port);
    }
  } catch {
    // No launch.json — fall back to the default ports.
  }
  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort > 0) ports.add(envPort);
  return [...ports];
}

function isListening(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    const settle = (value: boolean) => {
      socket.destroy();
      resolvePromise(value);
    };
    socket.once("connect", () => settle(true));
    socket.once("error", () => resolvePromise(false));
    socket.setTimeout(400, () => settle(false));
  });
}

/** Exits with a clear message if a dev server is holding the local database. */
export async function assertDatabaseUnlocked(): Promise<void> {
  if (process.env.DATABASE_URL || process.env.ALLOW_DB_LOCK === "1") return;
  const busy = (await Promise.all(candidatePorts().map(isListening))).some(Boolean);
  if (!busy) return;
  process.stderr.write(
    `\n[db] A dev server appears to be running (a project port is listening).\n` +
      `     PGlite is single-process — opening the local database now, while\n` +
      `     the server holds it, WILL corrupt it (RuntimeError: Aborted()).\n\n` +
      `     Fix: stop 'npm run dev', then re-run this command.\n` +
      `     If nothing is actually using the database, set ALLOW_DB_LOCK=1.\n\n`,
  );
  process.exit(1);
}
