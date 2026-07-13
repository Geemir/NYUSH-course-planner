import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { Course, PlanSnapshot, SpecialRule } from "@/lib/types";

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
  role: text("role", { enum: ["student", "admin"] })
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
// dismissedWarnings, startYear, customCourses) stored as JSONB, so the
// existing planIO helpers serialize straight into the column.
// ---------------------------------------------------------------------------

export const plans = pgTable("plan", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("My 4-Year Plan"),
  isActive: boolean("isActive").notNull().default(true),
  snapshot: jsonb("snapshot").$type<PlanSnapshot>().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

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

export type UserRow = typeof users.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
