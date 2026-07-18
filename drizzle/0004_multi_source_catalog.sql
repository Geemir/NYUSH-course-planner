CREATE TABLE "catalogRelease" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"sourceSnapshotIds" jsonb NOT NULL,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogReleaseSource" (
	"releaseId" text NOT NULL,
	"sourceId" text NOT NULL,
	"snapshotId" text NOT NULL,
	CONSTRAINT "catalogReleaseSource_releaseId_sourceId_pk" PRIMARY KEY("releaseId","sourceId")
);
--> statement-breakpoint
CREATE TABLE "catalogSource" (
	"id" text PRIMARY KEY NOT NULL,
	"schoolName" text NOT NULL,
	"campus" text NOT NULL,
	"bulletinRoot" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "catalogSource" ("id", "schoolName", "campus", "bulletinRoot", "enabled")
VALUES ('nyu-shanghai', 'NYU Shanghai', 'shanghai', 'https://bulletins.nyu.edu/undergraduate/shanghai/', true)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
DROP INDEX "catalog_snapshot_one_active";--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "stableId" text;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "sourceId" text;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "minCredits" double precision;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "maxCredits" double precision;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "catalogOfferingTerms" jsonb;--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD COLUMN "searchText" text;--> statement-breakpoint
UPDATE "catalogCourse"
SET "stableId" = 'nyu-shanghai:' || "courseId",
    "sourceId" = 'nyu-shanghai',
    "code" = "courseId",
    "subject" = split_part("courseId", ' ', 1),
    "title" = COALESCE("data"->>'title', "courseId"),
    "minCredits" = COALESCE(("data"->>'minCredits')::double precision, ("data"->>'credits')::double precision, 0),
    "maxCredits" = COALESCE(("data"->>'maxCredits')::double precision, ("data"->>'credits')::double precision, 0),
    "level" = 'undergraduate',
    "catalogOfferingTerms" = COALESCE("data"->'offered', '[]'::jsonb),
    "searchText" = lower("courseId" || ' ' || COALESCE("data"->>'title', ''));--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "stableId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "sourceId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "subject" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "minCredits" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "maxCredits" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "level" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "catalogOfferingTerms" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogCourse" ALTER COLUMN "searchText" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogSnapshot" ADD COLUMN "sourceId" text DEFAULT 'nyu-shanghai' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogSnapshot" ADD COLUMN "quarantinedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO "catalogRelease" ("id", "status", "sourceSnapshotIds", "publishedAt")
SELECT 'release-' || "id", 'active', jsonb_build_object('nyu-shanghai', "id"), COALESCE("completedAt", now())
FROM "catalogSnapshot" WHERE "status" = 'active';--> statement-breakpoint
INSERT INTO "catalogReleaseSource" ("releaseId", "sourceId", "snapshotId")
SELECT 'release-' || "id", 'nyu-shanghai', "id"
FROM "catalogSnapshot" WHERE "status" = 'active';--> statement-breakpoint
ALTER TABLE "catalogReleaseSource" ADD CONSTRAINT "catalogReleaseSource_releaseId_catalogRelease_id_fk" FOREIGN KEY ("releaseId") REFERENCES "public"."catalogRelease"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogReleaseSource" ADD CONSTRAINT "catalogReleaseSource_sourceId_catalogSource_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."catalogSource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogReleaseSource" ADD CONSTRAINT "catalogReleaseSource_snapshotId_catalogSnapshot_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."catalogSnapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_release_one_active" ON "catalogRelease" USING btree ("status") WHERE "catalogRelease"."status" = 'active';--> statement-breakpoint
CREATE INDEX "catalog_release_source_snapshot" ON "catalogReleaseSource" USING btree ("snapshotId");--> statement-breakpoint
ALTER TABLE "catalogSnapshot" ADD CONSTRAINT "catalogSnapshot_sourceId_catalogSource_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."catalogSource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_course_snapshot_stable" ON "catalogCourse" USING btree ("snapshotId","stableId");--> statement-breakpoint
CREATE INDEX "catalog_course_source_subject_code" ON "catalogCourse" USING btree ("sourceId","subject","code","stableId");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_snapshot_one_active_per_source" ON "catalogSnapshot" USING btree ("sourceId") WHERE "catalogSnapshot"."status" = 'active';--> statement-breakpoint
CREATE INDEX "catalog_snapshot_source_status" ON "catalogSnapshot" USING btree ("sourceId","status");
