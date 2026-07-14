import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { getActiveCatalog, type CatalogDb } from "@/lib/catalogRepository";
import {
  BulletinCatalogResponseSchema,
  CATALOG_FALLBACK,
  CatalogResponseSchema,
  type BulletinCatalogResponse,
  type CatalogResponse,
} from "@/lib/data";
import {
  Course,
  CourseSchema,
  PlanSnapshot,
  SpecialRule,
  SpecialRuleSchema,
} from "@/lib/types";

/** Either driver — both expose the same query API for our schema. */
export type Db =
  | NodePgDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

/** A blank plan, used when a user has no saved plan yet. */
export function emptySnapshot(): PlanSnapshot {
  return {
    version: 1,
    placements: [],
    studyAway: {},
    completedSemesters: [],
    activePrograms: ["core", "cs", "ima"],
    customCourses: [],
    dismissedWarnings: [],
    startYear: 2025,
  };
}

/** Returns the user's active plan snapshot, or null if they have none yet. */
export async function getActivePlan(
  db: Db,
  userId: string,
): Promise<PlanSnapshot | null> {
  const rows = await db
    .select({ snapshot: schema.plans.snapshot })
    .from(schema.plans)
    .where(eq(schema.plans.userId, userId))
    .limit(1);
  return rows[0]?.snapshot ?? null;
}

/**
 * Inserts or updates the user's active plan. One active plan per user in the
 * MVP, so we upsert the single row rather than creating duplicates.
 */
export async function saveActivePlan(
  db: Db,
  userId: string,
  snapshot: PlanSnapshot,
): Promise<void> {
  const existing = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .where(eq(schema.plans.userId, userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.plans)
      .set({ snapshot, updatedAt: new Date() })
      .where(eq(schema.plans.id, existing[0].id));
  } else {
    await db.insert(schema.plans).values({ userId, snapshot });
  }
}

// ---------------------------------------------------------------------------
// Course catalog (shared, admin-managed)
// ---------------------------------------------------------------------------

function toRow(course: Course, source: string) {
  return {
    id: course.id,
    subject: course.id.split(/\s+/)[0] ?? null,
    title: course.title,
    credits: Math.round(course.credits),
    data: course,
    source,
  };
}

/**
 * Seeds the catalog from the bundled courses.json the first time the table is
 * empty (idempotent via ON CONFLICT DO NOTHING). Lets a fresh dev DB or a new
 * production database come up populated without a separate seed step.
 */
export async function ensureCatalogSeeded(db: Db): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.courses);
  if (count > 0) return;

  const parsed = CourseSchema.array().parse(CATALOG_FALLBACK.courses);
  if (parsed.length === 0) return;
  await db
    .insert(schema.courses)
    .values(parsed.map((c) => toRow(c, "seed")))
    .onConflictDoNothing();
}

/** All catalog courses, validated through CourseSchema (defaults applied). */
export async function getAllCourses(db: Db): Promise<Course[]> {
  await ensureCatalogSeeded(db);
  const rows = await db.select({ data: schema.courses.data }).from(schema.courses);
  const out: Course[] = [];
  for (const row of rows) {
    const parsed = CourseSchema.safeParse(row.data);
    if (parsed.success) out.push(parsed.data);
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** Upserts courses (admin import/edit). Returns the number written. */
export async function upsertCourses(
  db: Db,
  newCourses: Course[],
  source = "import",
): Promise<number> {
  if (newCourses.length === 0) return 0;
  for (const course of newCourses) {
    const row = toRow(course, source);
    await db
      .insert(schema.courses)
      .values(row)
      .onConflictDoUpdate({
        target: schema.courses.id,
        set: {
          subject: row.subject,
          title: row.title,
          credits: row.credits,
          data: row.data,
          source: row.source,
          version: sql`${schema.courses.version} + 1`,
          updatedAt: new Date(),
        },
      });
  }
  return newCourses.length;
}

/** Removes a course from the shared catalog. */
export async function deleteCourse(db: Db, courseId: string): Promise<void> {
  await db.delete(schema.courses).where(eq(schema.courses.id, courseId));
}

// ---------------------------------------------------------------------------
// Special rules (admin-authored; engines consult them)
// ---------------------------------------------------------------------------

/** Example rules seeded into a fresh DB so the feature is visible/demoable. */
const SEED_RULES: SpecialRule[] = SpecialRuleSchema.array().parse(
  CATALOG_FALLBACK.rules,
);

/** Seeds example rules the first time the table is empty (idempotent). */
export async function ensureRulesSeeded(db: Db): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.rules);
  if (count > 0) return;
  await db
    .insert(schema.rules)
    .values(
      SEED_RULES.map((r) => ({ id: r.id, kind: r.kind, data: r, note: r.note })),
    )
    .onConflictDoNothing();
}

export type RuleStatus = "active" | "draft";

/** Rules with the given status, validated through SpecialRuleSchema. */
export async function getRulesByStatus(
  db: Db,
  status: RuleStatus,
): Promise<SpecialRule[]> {
  await ensureRulesSeeded(db);
  const rows = await db
    .select({ data: schema.rules.data })
    .from(schema.rules)
    .where(eq(schema.rules.status, status));
  return rows.map((row) => SpecialRuleSchema.parse(row.data));
}

/** Active rules — the only ones the engines consult. */
export function getActiveRules(db: Db): Promise<SpecialRule[]> {
  return getRulesByStatus(db, "active");
}

/** Reads one schema-validated active Bulletin candidate and its active rules. */
export async function readActiveCatalogResponse(
  db: Db,
): Promise<BulletinCatalogResponse | null> {
  const active = await getActiveCatalog(db as CatalogDb);
  if (!active) return null;
  const rules = await getActiveRules(db);
  return BulletinCatalogResponseSchema.parse({
    snapshot: {
      id: active.snapshotId,
      sourceHash: active.sourceHash,
      kind: "bulletin",
    },
    courses: active.courses,
    programs: active.programs,
    rules,
  });
}

/**
 * Converts read/validation failures to the checked-in nonempty LKG. The
 * callback boundary keeps the fallback policy reusable by the route and tests.
 */
export async function catalogResponseWithFallback(
  read: () => Promise<unknown | null>,
  onError?: (error: unknown) => void,
): Promise<CatalogResponse> {
  try {
    const response = await read();
    return response === null
      ? CATALOG_FALLBACK
      : CatalogResponseSchema.parse(response);
  } catch (error) {
    onError?.(error);
    return CATALOG_FALLBACK;
  }
}

/** Public catalog read: active Bulletin snapshot, otherwise the coherent LKG. */
export function getCatalogResponse(db: Db): Promise<CatalogResponse> {
  return catalogResponseWithFallback(
    () => readActiveCatalogResponse(db),
    (error) => console.error("[catalog] failed to read active catalog:", error),
  );
}

/**
 * Inserts or replaces a rule. The agent saves as "draft" (pending review);
 * admins save/approve as "active". The engines ignore drafts.
 */
export async function upsertRule(
  db: Db,
  rule: SpecialRule,
  status: RuleStatus = "active",
): Promise<void> {
  await db
    .insert(schema.rules)
    .values({ id: rule.id, kind: rule.kind, data: rule, note: rule.note, status })
    .onConflictDoUpdate({
      target: schema.rules.id,
      set: {
        kind: rule.kind,
        data: rule,
        note: rule.note,
        status,
        updatedAt: new Date(),
      },
    });
}

/** Approve/return-to-draft a rule by id. */
export async function setRuleStatus(
  db: Db,
  ruleId: string,
  status: RuleStatus,
): Promise<void> {
  await db
    .update(schema.rules)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.rules.id, ruleId));
}

/** Removes a rule. */
export async function deleteRule(db: Db, ruleId: string): Promise<void> {
  await db.delete(schema.rules).where(eq(schema.rules.id, ruleId));
}
