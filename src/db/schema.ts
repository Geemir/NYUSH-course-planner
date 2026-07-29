import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";
import type { SnapshotValidationReport } from "@/lib/bulletin/validateSnapshot";
import type {
  CatalogProgram,
  Course,
  PersistedPlanSnapshot,
  SpecialRule,
} from "@/lib/types";
import type {
  CatalogCourseRecord,
  CatalogReleaseRef,
} from "@/lib/catalog/types";
import type {
  CorrectionIssueType,
  CorrectionStatus,
  CorrectionTarget,
} from "@/lib/corrections/types";
import type { CorrectionOverlayInput } from "@/lib/corrections/policy";

// ---------------------------------------------------------------------------
// Auth.js (NextAuth) core tables — standard adapter schema.
// `role` is our addition for admin gating (Phase 2+).
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: text("role", { enum: ["student", "maintainer", "admin"] })
    .notNull()
    .default("student"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// Per-user plans. The plan body reuses the client-side PlanSnapshot shape
// (placements, studyAway, completedSemesters, activePrograms,
// fulfillmentFacts, dismissedWarnings, startYear, customCourses) stored as
// JSONB. Persistence materializes missing legacy fulfillment facts as [].
// ---------------------------------------------------------------------------

export const plans = pgTable(
  "plan",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("My 4-Year Plan"),
    isActive: boolean("isActive").notNull().default(true),
    snapshot: jsonb("snapshot").$type<PersistedPlanSnapshot>().notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (plan) => [
    uniqueIndex("plan_one_active_per_user")
      .on(plan.userId)
      .where(sql`${plan.isActive} = true`),
  ],
);

// ---------------------------------------------------------------------------
// Shared course catalog. The full Course object lives in `data` (JSONB,
// validated by CourseSchema on read); the flat columns are for querying and
// provenance. Admin-managed: imports and edits write here for everyone.
// (Programs/sites stay as JSON in code for now — they change rarely.)
// ---------------------------------------------------------------------------

export const courses = pgTable("course", {
  id: text("id").primaryKey(), // official course code, e.g. "CSCI-SHU 210"
  subject: text("subject"), // e.g. "CSCI-SHU" — for filtering
  title: text("title").notNull(),
  credits: integer("credits").notNull(),
  data: jsonb("data").$type<Course>().notNull(),
  source: text("source").notNull().default("seed"), // seed | import | manual
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Special rules (admin-authored; the deterministic engines consult them).
// The full SpecialRule lives in `data`; `status` gates activation (Phase 4
// adds an approval queue), `kind` is duplicated as a column for filtering.
// ---------------------------------------------------------------------------

export const rules = pgTable("rule", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  kind: text("kind").notNull(),
  data: jsonb("data").$type<SpecialRule>().notNull(),
  status: text("status", { enum: ["active", "draft"] })
    .notNull()
    .default("active"),
  note: text("note"),
  createdBy: text("createdBy"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Immutable, versioned Bulletin catalogs. Child rows are snapshot-scoped so
// repeated official IDs remain available in every historical publication.
// ---------------------------------------------------------------------------

export const catalogSource = pgTable("catalogSource", {
  id: text("id").primaryKey(),
  schoolName: text("schoolName").notNull(),
  campus: text("campus", { enum: ["shanghai", "new-york"] }).notNull(),
  bulletinRoot: text("bulletinRoot").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const catalogSnapshot = pgTable(
  "catalogSnapshot",
  {
    id: text("id").primaryKey(),
    sourceId: text("sourceId")
      .notNull()
      .default("nyu-shanghai")
      .references(() => catalogSource.id),
    sourceHash: text("sourceHash").notNull(),
    status: text("status", {
      enum: ["building", "active", "retired", "failed"],
    })
      .notNull()
      .default("building"),
    validationReport: jsonb("validationReport")
      .$type<SnapshotValidationReport>()
      .notNull(),
    documentCount: integer("documentCount").notNull(),
    courseCount: integer("courseCount").notNull(),
    programCount: integer("programCount").notNull(),
    quarantinedCount: integer("quarantinedCount").notNull().default(0),
    sourceReferenceIds: jsonb("sourceReferenceIds")
      .$type<string[]>()
      .notNull(),
    externalCourseIds: jsonb("externalCourseIds").$type<string[]>().notNull(),
    unresolvedCourseIds: jsonb("unresolvedCourseIds")
      .$type<string[]>()
      .notNull(),
    failureSummary: text("failureSummary"),
    startedAt: timestamp("startedAt", { mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completedAt", { mode: "date" }),
  },
  (snapshot) => [
    uniqueIndex("catalog_snapshot_one_active_per_source")
      .on(snapshot.sourceId)
      .where(sql`${snapshot.status} = 'active'`),
    index("catalog_snapshot_source_status").on(snapshot.sourceId, snapshot.status),
  ],
);

export const catalogSourceDocument = pgTable(
  "catalogSourceDocument",
  {
    snapshotId: text("snapshotId")
      .notNull()
      .references(() => catalogSnapshot.id, { onDelete: "cascade" }),
    sourceUrl: text("sourceUrl").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
  },
  (document) => [
    primaryKey({ columns: [document.snapshotId, document.sourceUrl] }),
  ],
);

export const catalogCourse = pgTable(
  "catalogCourse",
  {
    snapshotId: text("snapshotId")
      .notNull()
      .references(() => catalogSnapshot.id, { onDelete: "cascade" }),
    courseId: text("courseId").notNull(),
    stableId: text("stableId").notNull(),
    sourceId: text("sourceId").notNull(),
    code: text("code").notNull(),
    subject: text("subject").notNull(),
    title: text("title").notNull(),
    minCredits: doublePrecision("minCredits").notNull(),
    maxCredits: doublePrecision("maxCredits").notNull(),
    level: text("level", {
      enum: ["undergraduate", "graduate", "ambiguous"],
    }).notNull(),
    catalogOfferingTerms: jsonb("catalogOfferingTerms")
      .$type<string[]>()
      .notNull(),
    searchText: text("searchText").notNull(),
    data: jsonb("data").$type<Course | CatalogCourseRecord>().notNull(),
  },
  (course) => [
    primaryKey({ columns: [course.snapshotId, course.courseId] }),
    uniqueIndex("catalog_course_snapshot_stable").on(
      course.snapshotId,
      course.stableId,
    ),
    index("catalog_course_source_subject_code").on(
      course.sourceId,
      course.subject,
      course.code,
      course.stableId,
    ),
  ],
);

export const catalogProgram = pgTable(
  "catalogProgram",
  {
    snapshotId: text("snapshotId")
      .notNull()
      .references(() => catalogSnapshot.id, { onDelete: "cascade" }),
    programId: text("programId").notNull(),
    data: jsonb("data").$type<CatalogProgram>().notNull(),
  },
  (program) => [
    primaryKey({ columns: [program.snapshotId, program.programId] }),
  ],
);

export const catalogRelease = pgTable(
  "catalogRelease",
  {
    id: text("id").primaryKey(),
    status: text("status", { enum: ["building", "active", "retired"] })
      .notNull()
      .default("building"),
    sourceSnapshotIds: jsonb("sourceSnapshotIds")
      .$type<CatalogReleaseRef["sourceSnapshotIds"]>()
      .notNull(),
    publishedAt: timestamp("publishedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (release) => [
    uniqueIndex("catalog_release_one_active")
      .on(release.status)
      .where(sql`${release.status} = 'active'`),
  ],
);

export const catalogReleaseSource = pgTable(
  "catalogReleaseSource",
  {
    releaseId: text("releaseId")
      .notNull()
      .references(() => catalogRelease.id, { onDelete: "cascade" }),
    sourceId: text("sourceId")
      .notNull()
      .references(() => catalogSource.id),
    snapshotId: text("snapshotId")
      .notNull()
      .references(() => catalogSnapshot.id),
  },
  (membership) => [
    primaryKey({ columns: [membership.releaseId, membership.sourceId] }),
    index("catalog_release_source_snapshot").on(membership.snapshotId),
  ],
);

// ---------------------------------------------------------------------------
// Correction Hub. Source snapshots remain immutable; applied corrections are
// separate reviewed overlays with an append-only event trail.
// ---------------------------------------------------------------------------

export const correctionRequest = pgTable("correctionRequest", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetKind: text("targetKind").notNull(),
  targetData: jsonb("targetData").$type<CorrectionTarget>().notNull(),
  issueType: text("issueType").$type<CorrectionIssueType>().notNull(),
  catalogReleaseId: text("catalogReleaseId"),
  contextData: jsonb("contextData").$type<Record<string, unknown>>().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  suggestedCorrection: text("suggestedCorrection"),
  evidenceUrl: text("evidenceUrl"),
  status: text("status").$type<CorrectionStatus>().notNull().default("submitted"),
  assignedTo: text("assignedTo").references(() => users.id, { onDelete: "set null" }),
  duplicateOfId: text("duplicateOfId"),
  withdrawnAt: timestamp("withdrawnAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  closedAt: timestamp("closedAt", { mode: "date" }),
}, (request) => [
  index("correction_owner_updated").on(request.userId, request.updatedAt),
  index("correction_status_created").on(request.status, request.createdAt),
  index("correction_target").on(request.targetKind),
]);

export const correctionMessage = pgTable("correctionMessage", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  requestId: text("requestId").notNull().references(() => correctionRequest.id, { onDelete: "cascade" }),
  authorUserId: text("authorUserId").references(() => users.id, { onDelete: "set null" }),
  visibility: text("visibility", { enum: ["public", "internal"] }).notNull().default("public"),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
}, (message) => [index("correction_message_request_time").on(message.requestId, message.createdAt)]);

export const correctionEvent = pgTable("correctionEvent", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  requestId: text("requestId").notNull().references(() => correctionRequest.id, { onDelete: "cascade" }),
  actorUserId: text("actorUserId").references(() => users.id, { onDelete: "set null" }),
  eventType: text("eventType").notNull(),
  fromStatus: text("fromStatus").$type<CorrectionStatus>(),
  toStatus: text("toStatus").$type<CorrectionStatus>(),
  publicNote: text("publicNote"),
  privateNote: text("privateNote"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
}, (event) => [index("correction_event_request_time").on(event.requestId, event.createdAt)]);

export const catalogOverlay = pgTable("catalogOverlay", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  requestId: text("requestId").references(() => correctionRequest.id),
  origin: text("origin", { enum: ["correction", "direct"] }).notNull().default("correction"),
  reason: text("reason"),
  targetKind: text("targetKind").notNull(),
  targetKey: text("targetKey").notNull(),
  patchType: text("patchType").notNull(),
  patchData: jsonb("patchData").$type<CorrectionOverlayInput>().notNull(),
  sourceReleaseId: text("sourceReleaseId"),
  status: text("status", { enum: ["active", "superseded"] }).notNull().default("active"),
  appliedBy: text("appliedBy").references(() => users.id, { onDelete: "set null" }),
  appliedAt: timestamp("appliedAt", { mode: "date" }).notNull().defaultNow(),
  supersededAt: timestamp("supersededAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
}, (overlay) => [
  uniqueIndex("catalog_overlay_request_unique").on(overlay.requestId),
  index("catalog_overlay_active_target").on(overlay.status, overlay.targetKind, overlay.targetKey),
]);

export const catalogOverlayEvent = pgTable("catalogOverlayEvent", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  overlayId: text("overlayId").notNull().references(() => catalogOverlay.id, { onDelete: "cascade" }),
  actorUserId: text("actorUserId").references(() => users.id, { onDelete: "set null" }),
  eventType: text("eventType", { enum: ["created", "reverted", "restored"] }).notNull(),
  reason: text("reason").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
}, (event) => [index("catalog_overlay_event_overlay_time").on(event.overlayId, event.createdAt)]);

export const notification = pgTable("notification", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  requestId: text("requestId").references(() => correctionRequest.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("readAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
}, (item) => [index("notification_user_unread").on(item.userId, item.readAt, item.createdAt)]);

// ---------------------------------------------------------------------------
// Global planner announcements. Drafts and archived notices remain auditable;
// a partial unique index guarantees that publication has one global winner.
// ---------------------------------------------------------------------------

export const announcements = pgTable("announcement", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  body: text("body").notNull(),
  tone: text("tone", { enum: ["info", "warning", "critical"] }).notNull().default("info"),
  linkUrl: text("linkUrl"),
  linkLabel: text("linkLabel"),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  publishedAt: timestamp("publishedAt", { mode: "date" }),
  expiresAt: timestamp("expiresAt", { mode: "date" }),
  createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
}, (announcement) => [
  uniqueIndex("announcement_one_published")
    .on(announcement.status)
    .where(sql`${announcement.status} = 'published'`),
  index("announcement_created_at").on(announcement.createdAt),
]);

export type UserRow = typeof users.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
export type CatalogSnapshotRow = typeof catalogSnapshot.$inferSelect;
export type CorrectionRequestRow = typeof correctionRequest.$inferSelect;
export type CatalogOverlayRow = typeof catalogOverlay.$inferSelect;
export type CatalogOverlayEventRow = typeof catalogOverlayEvent.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
