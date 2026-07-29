import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import {
  getActiveCatalog,
  getActiveReleaseCatalog,
  type CatalogDb,
} from "@/lib/catalogRepository";
import {
  BulletinCatalogResponseSchema,
  CATALOG_FALLBACK,
  ComposedBulletinCatalogResponseSchema,
  PublicCatalogResponseSchema,
  type BulletinCatalogResponse,
  type ComposedBulletinCatalogResponse,
  type PublicCatalogResponse,
} from "@/lib/data";
import {
  CatalogProgram,
  CatalogProgramSchema,
  Course,
  CourseSchema,
  PlanSnapshot,
  PlanSnapshotV2,
  PersistedPlanSnapshot,
  RequirementNode,
  SpecialRule,
  SpecialRuleSchema,
} from "@/lib/types";
import { parsePlan, parsePlanDocument } from "@/lib/planIO";

/** Either driver — both expose the same query API for our schema. */
export type Db =
  | NodePgDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

type TransactionRunner = {
  transaction<T>(operation: (tx: Db) => Promise<T>): Promise<T>;
};

function inTransaction<T>(
  db: Db,
  operation: (tx: Db) => Promise<T>,
): Promise<T> {
  return (db as unknown as TransactionRunner).transaction(operation);
}

/** A blank plan, used when a user has no saved plan yet. */
export function emptySnapshot(): PlanSnapshot {
  return {
    version: 1,
    placements: [],
    studyAway: {},
    completedSemesters: [],
    activePrograms: ["core", "cs", "ima"],
    customCourses: [],
    fulfillmentFacts: [],
    dismissedWarnings: [],
    startYear: 2025,
  };
}

/** Returns the user's active plan snapshot, or null if they have none yet. */
export async function getActivePlan(
  db: Db,
  userId: string,
): Promise<PersistedPlanSnapshot | null> {
  const rows = await db
    .select({ snapshot: schema.plans.snapshot })
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.userId, userId),
        eq(schema.plans.isActive, true),
      ),
    )
    .limit(1);
  const snapshot = rows[0]?.snapshot;
  if (!snapshot) return null;
  return snapshot.version === 1
    ? { ...snapshot, fulfillmentFacts: snapshot.fulfillmentFacts ?? [] }
    : { ...snapshot, requirementStatusOverrides: snapshot.requirementStatusOverrides ?? [] };
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
  const persistedSnapshot = {
    ...snapshot,
    fulfillmentFacts: snapshot.fulfillmentFacts ?? [],
  };
  await inTransaction(db, async (tx) => {
    await lockMutableCourseReferences(
      tx,
      persistedSnapshot.placements.map(({ courseId }) => courseId),
      new Set(persistedSnapshot.customCourses.map(({ id }) => id)),
    );
    await tx
      .insert(schema.plans)
      .values({ userId, isActive: true, snapshot: persistedSnapshot })
      .onConflictDoUpdate({
        target: schema.plans.userId,
        targetWhere: sql`${schema.plans.isActive} = true`,
        set: { snapshot: persistedSnapshot, updatedAt: new Date() },
      });
  });
}

export interface StoredPlanEnvelope {
  snapshot: PersistedPlanSnapshot;
  revision: number;
  updatedAt: string;
}

export type SavePlanResult =
  | { status: "saved"; plan: StoredPlanEnvelope }
  | { status: "conflict"; server: StoredPlanEnvelope };

function planEnvelope(row: {
  snapshot: PersistedPlanSnapshot;
  revision: number;
  updatedAt: Date;
}): StoredPlanEnvelope {
  const snapshot = parsePlanDocument(JSON.stringify(row.snapshot));
  return {
    snapshot,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getActivePlanEnvelope(
  db: Db,
  userId: string,
): Promise<StoredPlanEnvelope | null> {
  const rows = await db
    .select({
      snapshot: schema.plans.snapshot,
      revision: schema.plans.revision,
      updatedAt: schema.plans.updatedAt,
    })
    .from(schema.plans)
    .where(and(eq(schema.plans.userId, userId), eq(schema.plans.isActive, true)))
    .limit(1);
  return rows[0] ? planEnvelope(rows[0]) : null;
}

/** Compare-and-swap save. A stale client never mutates the server row. */
export async function saveActivePlanRevision(
  db: Db,
  userId: string,
  snapshot: PlanSnapshotV2,
  baseRevision: number | null,
): Promise<SavePlanResult> {
  return inTransaction(db, async (tx) => {
    await lockMutableCourseReferences(
      tx,
      snapshot.placements.map(({ courseId }) => courseId),
      new Set(snapshot.customCourses.map(({ id }) => id)),
    );
    const now = new Date();
    if (baseRevision === null) {
      const inserted = await tx
        .insert(schema.plans)
        .values({ userId, isActive: true, snapshot, revision: 1, updatedAt: now })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return { status: "saved", plan: planEnvelope(inserted[0]) };
    } else {
      const updated = await tx
        .update(schema.plans)
        .set({
          snapshot,
          revision: sql`${schema.plans.revision} + 1`,
          updatedAt: now,
        })
        .where(and(
          eq(schema.plans.userId, userId),
          eq(schema.plans.isActive, true),
          eq(schema.plans.revision, baseRevision),
        ))
        .returning();
      if (updated[0]) return { status: "saved", plan: planEnvelope(updated[0]) };
    }

    const server = await getActivePlanEnvelope(tx, userId);
    if (!server) throw new Error("Plan revision conflict without an active server plan.");
    return { status: "conflict", server };
  });
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

export const COURSE_REFERENCE_KINDS = ["plan", "program", "rule"] as const;
export type CourseReferenceKind = (typeof COURSE_REFERENCE_KINDS)[number];

export class CourseReferencedError extends Error {
  readonly name = "CourseReferencedError";

  constructor(
    readonly courseId: string,
    readonly references: CourseReferenceKind[],
  ) {
    super(`Course "${courseId}" is referenced by ${references.join(", ")}.`);
  }
}

export class CourseReferenceTargetNotFoundError extends Error {
  readonly name = "CourseReferenceTargetNotFoundError";

  constructor(readonly courseIds: string[]) {
    super(`Missing referenced course: ${courseIds.join(", ")}.`);
  }
}

const IMMUTABLE_FALLBACK_COURSE_IDS = new Set(
  CATALOG_FALLBACK.courses.map(({ id }) => id),
);

function specialRuleCourseIds(rule: SpecialRule): string[] {
  switch (rule.kind) {
    case "equivalence":
      return [rule.course, rule.target];
    case "concurrentPrereq":
      return [
        rule.course,
        rule.prereq,
        ...(rule.condition ? [rule.condition.course] : []),
      ];
  }
}

/**
 * Locks mutable reference targets in stable order. IDs backed only by the
 * immutable fallback, an active Bulletin snapshot, or the plan's own custom
 * courses are valid without a mutable row because legacy deletion cannot
 * remove those targets.
 */
async function lockMutableCourseReferences(
  db: Db,
  courseIds: string[],
  additionalImmutableIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const uniqueIds = [...new Set(courseIds)].sort();
  if (uniqueIds.length === 0) return;

  const mutableRows = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(inArray(schema.courses.id, uniqueIds))
    .orderBy(schema.courses.id)
    .for("key share");
  const mutableIds = new Set(mutableRows.map(({ id }) => id));
  const unresolvedIds = uniqueIds.filter(
    (id) =>
      !mutableIds.has(id) &&
      !IMMUTABLE_FALLBACK_COURSE_IDS.has(id) &&
      !additionalImmutableIds.has(id),
  );
  if (unresolvedIds.length === 0) return;

  const activeSnapshotRows = await db
    .select({ id: schema.catalogCourse.courseId })
    .from(schema.catalogCourse)
    .innerJoin(
      schema.catalogSnapshot,
      eq(schema.catalogCourse.snapshotId, schema.catalogSnapshot.id),
    )
    .where(
      and(
        eq(schema.catalogSnapshot.status, "active"),
        inArray(schema.catalogCourse.courseId, unresolvedIds),
      ),
    );
  const activeSnapshotIds = new Set(activeSnapshotRows.map(({ id }) => id));
  const missingIds = unresolvedIds.filter((id) => !activeSnapshotIds.has(id));
  if (missingIds.length > 0) {
    throw new CourseReferenceTargetNotFoundError(missingIds);
  }
}

function requirementReferencesCourse(
  requirement: RequirementNode,
  courseId: string,
): boolean {
  switch (requirement.kind) {
    case "course":
      return requirement.courseId === courseId;
    case "all":
    case "any":
    case "choose":
    case "credits":
      return requirement.children.some((child) =>
        requirementReferencesCourse(child, courseId),
      );
    case "exclusion":
      return (
        requirement.excludedCourseIds.includes(courseId) ||
        requirementReferencesCourse(requirement.child, courseId)
      );
    case "attribute":
    case "waiver":
    case "manualConfirmation":
      return false;
  }
}

function programReferencesCourse(
  program: CatalogProgram,
  courseId: string,
): boolean {
  return (
    program.sourceReferenceIds.includes(courseId) ||
    program.categories.some((category) =>
      requirementReferencesCourse(category.requirement, courseId),
    ) ||
    program.requirementRows.some((row) =>
      requirementReferencesCourse(row.node, courseId),
    )
  );
}

function ruleReferencesCourse(rule: SpecialRule, courseId: string): boolean {
  return specialRuleCourseIds(rule).includes(courseId);
}

function validatePersistedPlanSnapshot(value: unknown): PlanSnapshot {
  // parsePlan owns the persisted plan shape. It intentionally filters stale
  // IDs, so scan the original value only after its complete shape validates.
  parsePlan(JSON.stringify(value));
  return value as PlanSnapshot;
}

/** Finds persisted references that must be edited before a legacy delete. */
export async function findCourseReferences(
  db: Db,
  courseId: string,
): Promise<CourseReferenceKind[]> {
  const references = new Set<CourseReferenceKind>();

  const planRows = await db
    .select({ snapshot: schema.plans.snapshot })
    .from(schema.plans);
  if (
    planRows
      .map(({ snapshot }) => validatePersistedPlanSnapshot(snapshot))
      .some((snapshot) =>
        snapshot.placements.some((placement) => placement.courseId === courseId),
      )
  ) {
    references.add("plan");
  }

  const programRows = await db
    .select({ data: schema.catalogProgram.data })
    .from(schema.catalogProgram)
    .innerJoin(
      schema.catalogSnapshot,
      eq(schema.catalogProgram.snapshotId, schema.catalogSnapshot.id),
    )
    .where(eq(schema.catalogSnapshot.status, "active"));
  if (
    programRows
      .map(({ data }) => CatalogProgramSchema.parse(data))
      .some((program) => programReferencesCourse(program, courseId))
  ) {
    references.add("program");
  }

  const ruleRows = await db.select({ data: schema.rules.data }).from(schema.rules);
  if (
    ruleRows
      .map(({ data }) => SpecialRuleSchema.parse(data))
      .some((rule) => ruleReferencesCourse(rule, courseId))
  ) {
    references.add("rule");
  }

  return COURSE_REFERENCE_KINDS.filter((kind) => references.has(kind));
}

/** Removes an unreferenced course from the mutable shared catalog only. */
export async function deleteCourse(db: Db, courseId: string): Promise<void> {
  await inTransaction(db, async (tx) => {
    const rows = await tx
      .select({ id: schema.courses.id })
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .for("update");
    if (rows.length === 0) return;

    const references = await findCourseReferences(tx, courseId);
    if (references.length > 0) {
      throw new CourseReferencedError(courseId, references);
    }
    await tx.delete(schema.courses).where(eq(schema.courses.id, courseId));
  });
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
  await inTransaction(db, async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rules);
    if (count > 0 || SEED_RULES.length === 0) return;
    await lockMutableCourseReferences(
      tx,
      SEED_RULES.flatMap(specialRuleCourseIds),
    );
    await tx
      .insert(schema.rules)
      .values(
        SEED_RULES.map((r) => ({ id: r.id, kind: r.kind, data: r, note: r.note })),
      )
      .onConflictDoNothing();
  });
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
): Promise<BulletinCatalogResponse | ComposedBulletinCatalogResponse | null> {
  const releaseCatalog = await getActiveReleaseCatalog(db as CatalogDb);
  if (releaseCatalog) {
    const rules = await getActiveRules(db);
    return ComposedBulletinCatalogResponseSchema.parse({
      ...releaseCatalog,
      rules,
    });
  }
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
): Promise<PublicCatalogResponse> {
  try {
    const response = await read();
    return response === null
      ? CATALOG_FALLBACK
      : PublicCatalogResponseSchema.parse(response);
  } catch (error) {
    onError?.(error);
    return CATALOG_FALLBACK;
  }
}

/** Public catalog read: active Bulletin snapshot, otherwise the coherent LKG. */
export function getCatalogResponse(db: Db): Promise<PublicCatalogResponse> {
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
  const parsedRule = SpecialRuleSchema.parse(rule);
  await inTransaction(db, async (tx) => {
    await lockMutableCourseReferences(tx, specialRuleCourseIds(parsedRule));
    await tx
      .insert(schema.rules)
      .values({
        id: parsedRule.id,
        kind: parsedRule.kind,
        data: parsedRule,
        note: parsedRule.note,
        status,
      })
      .onConflictDoUpdate({
        target: schema.rules.id,
        set: {
          kind: parsedRule.kind,
          data: parsedRule,
          note: parsedRule.note,
          status,
          updatedAt: new Date(),
        },
      });
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
