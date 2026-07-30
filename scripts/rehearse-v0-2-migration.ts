import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

export interface MigrationRehearsalResult { ok: boolean; migrationCount: number; userCount: number; sessionCount: number; planCount: number; revision: number; snapshotVersion: number; correctionTablesPresent: boolean; announcementTablePresent: boolean; maintenanceAuditTablePresent: boolean; aboutTablePresent: boolean; translationTablePresent: boolean }

export function assertDisposableMigrationTarget(input: { allowed: boolean; target: string; productionTarget?: string }) {
  if (!input.allowed) throw new Error("Set ALLOW_DESTRUCTIVE_MIGRATION_REHEARSAL=true for an explicitly disposable target.");
  const normalized = input.target.toLowerCase();
  if (/prod(uction)?/.test(normalized) || (input.productionTarget && input.target === input.productionTarget)) throw new Error("Refusing a production-like migration rehearsal target.");
}

export async function runMigrationRehearsal(): Promise<MigrationRehearsalResult> {
  const client = new PGlite();
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: "./drizzle" });
  const legacySnapshot = { version: 1, placements: [{ courseId: "LEGACY-SHU 101", semesterId: "fall-2026" }], studyAway: {}, completedSemesters: [], activePrograms: ["core", "major"], customCourses: [], fulfillmentFacts: [], dismissedWarnings: [], startYear: 2026 };
  await database.insert(schema.users).values({ id: "migration-user", email: "migration@nyu.edu" });
  await database.insert(schema.sessions).values({ sessionToken: "migration-session", userId: "migration-user", expires: new Date("2099-01-01") });
  await database.insert(schema.plans).values({ id: "migration-plan", userId: "migration-user", snapshot: legacySnapshot as never });
  const [userRows, sessionRows, planRows, journal, correctionTables, announcementTable, maintenanceAuditTable, aboutTable, translationTable, plan] = await Promise.all([
    database.select({ count: sql<number>`count(*)::int` }).from(schema.users),
    database.select({ count: sql<number>`count(*)::int` }).from(schema.sessions),
    database.select({ count: sql<number>`count(*)::int` }).from(schema.plans),
    database.execute(sql`select count(*)::int as count from drizzle.__drizzle_migrations`),
    database.execute(sql`select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name in ('correctionRequest','correctionEvent','catalogOverlay')`),
    database.execute(sql`select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = 'announcement'`),
    database.execute(sql`select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = 'catalogOverlayEvent'`),
    database.execute(sql`select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = 'siteAbout'`),
    database.execute(sql`select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = 'translationCache'`),
    database.select().from(schema.plans).where(eq(schema.plans.id, "migration-plan")).limit(1),
  ]);
  const [users] = userRows;
  const [sessions] = sessionRows;
  const [plans] = planRows;
  const correctionTablesPresent = Number((correctionTables.rows[0] as { count: number }).count) === 3;
  const announcementTablePresent = Number((announcementTable.rows[0] as { count: number }).count) === 1;
  const maintenanceAuditTablePresent = Number((maintenanceAuditTable.rows[0] as { count: number }).count) === 1;
  const aboutTablePresent = Number((aboutTable.rows[0] as { count: number }).count) === 1;
  const translationTablePresent = Number((translationTable.rows[0] as { count: number }).count) === 1;
  const result = { ok: users.count === 1 && sessions.count === 1 && plans.count === 1 && plan[0].revision === 1 && correctionTablesPresent && announcementTablePresent && maintenanceAuditTablePresent && aboutTablePresent && translationTablePresent, migrationCount: Number((journal.rows[0] as { count: number }).count), userCount: users.count, sessionCount: sessions.count, planCount: plans.count, revision: plan[0].revision, snapshotVersion: (plan[0].snapshot as { version: number }).version, correctionTablesPresent, announcementTablePresent, maintenanceAuditTablePresent, aboutTablePresent, translationTablePresent };
  await client.close();
  return result;
}

async function main() {
  const target = process.env.MIGRATION_REHEARSAL_TARGET ?? "pglite://memory/v0-2-rehearsal";
  assertDisposableMigrationTarget({ allowed: process.env.ALLOW_DESTRUCTIVE_MIGRATION_REHEARSAL === "true", target, productionTarget: process.env.PRODUCTION_DATABASE_URL });
  const result = await runMigrationRehearsal();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("rehearse-v0-2-migration.ts")) void main().catch((error) => { console.error(error); process.exitCode = 1; });
