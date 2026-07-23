/**
 * One-command local dev startup. Does the database work FIRST (PGlite is
 * single-process, so it must finish and release the lock before the dev server
 * opens the database), then launches `next dev`:
 *
 *   npm run dev:full                 # push schema, seed if empty, fill NY, verify, start
 *   npm run dev:full -- --fresh      # wipe .pglite and rebuild from scratch first
 *   npm run dev:full -- --no-ny      # skip the New York study-away fill (NYUSH only)
 *   npm run dev:full -- --port 3000  # dev server port (default 3000)
 *
 * Each database step runs as its own child process that exits (releasing the
 * lock) before the next; the server is spawned last. Refuses to run if a dev
 * server is already up, so it can't corrupt the database.
 */
import { rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { isDevServerListening } from "./lib/preflight-db-lock";

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const skipNy = args.includes("--no-ny");
const portArg = args[args.indexOf("--port") + 1];
const port = args.includes("--port") && /^\d+$/.test(portArg ?? "") ? portArg : "3000";

const isWin = process.platform === "win32";

function step(title: string): void {
  console.log(`\n── ${title} ──`);
}

/** Runs a command to completion, inheriting stdio. Returns its exit code. */
function run(command: string, commandArgs: string[], useShell = false): number {
  // Windows + Node ≥20 refuses to spawn `.cmd` (npx/npm) without a shell; pass
  // one pre-joined string under a shell (args are trusted constants) to avoid
  // the DEP0190 "args with shell" warning.
  const shell = useShell && isWin;
  const result = shell
    ? spawnSync([command, ...commandArgs].join(" "), { stdio: "inherit", shell: true })
    : spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

/** Runs a project tsx script as a fresh child process (opens+closes the DB). */
function runScript(file: string, scriptArgs: string[] = []): number {
  return run(process.execPath, [
    "--conditions=react-server",
    "--import",
    "tsx",
    `scripts/${file}`,
    ...scriptArgs,
  ]);
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

async function main() {
  if (await isDevServerListening()) {
    fail(
      "A dev server is already running (a project port is listening).\n" +
        "  Stop it first — running the database steps alongside it would corrupt PGlite.",
    );
  }

  if (fresh) {
    step("Resetting local database (.pglite)");
    rmSync(".pglite", { recursive: true, force: true });
  }

  step("Applying schema (drizzle-kit push)");
  if (run("npx", ["drizzle-kit", "push", "--force"], true) !== 0) {
    fail("Schema push failed. If PGlite is wedged, delete .pglite and retry with --fresh.");
  }

  // Seed the NYUSH recovery catalog only when there is no active release yet
  // (catalog-status exits 3 when empty), so repeat runs don't wipe the catalog.
  step("Checking catalog");
  if (fresh || runScript("catalog-status.ts") === 3) {
    step("Seeding NYUSH recovery catalog (db:seed)");
    if (runScript("seed-dev-catalog.ts") !== 0) fail("Seeding failed.");
  }

  if (!skipNy) {
    step("Filling New York study-away catalog");
    let complete = false;
    for (let attempt = 1; attempt <= 3 && !complete; attempt += 1) {
      if (attempt > 1) console.log(`\n(retry ${attempt}/3 — syncing sources that didn't finish)`);
      complete = runScript("fill-ny-catalog.ts", ["--missing-only"]) === 0;
    }
    if (!complete) {
      console.warn(
        "\n⚠ New York catalog is incomplete after 3 attempts — starting with what synced." +
          "\n  Re-run later: npx tsx --conditions=react-server scripts/fill-ny-catalog.ts --missing-only",
      );
    }
  }

  step("Verifying catalog");
  runScript("catalog-status.ts");

  step(`Starting dev server on http://localhost:${port}`);
  const server = isWin
    ? spawn(`npx next dev --port ${port}`, { stdio: "inherit", shell: true })
    : spawn("npx", ["next", "dev", "--port", port], { stdio: "inherit" });
  server.on("exit", (code) => process.exit(code ?? 0));
  const stop = () => server.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
