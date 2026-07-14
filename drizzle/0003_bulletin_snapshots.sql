CREATE TABLE "catalogCourse" (
	"snapshotId" text NOT NULL,
	"courseId" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "catalogCourse_snapshotId_courseId_pk" PRIMARY KEY("snapshotId","courseId")
);
--> statement-breakpoint
CREATE TABLE "catalogProgram" (
	"snapshotId" text NOT NULL,
	"programId" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "catalogProgram_snapshotId_programId_pk" PRIMARY KEY("snapshotId","programId")
);
--> statement-breakpoint
CREATE TABLE "catalogSnapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"sourceHash" text NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"validationReport" jsonb NOT NULL,
	"documentCount" integer NOT NULL,
	"courseCount" integer NOT NULL,
	"programCount" integer NOT NULL,
	"sourceReferenceIds" jsonb NOT NULL,
	"externalCourseIds" jsonb NOT NULL,
	"unresolvedCourseIds" jsonb NOT NULL,
	"failureSummary" text,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "catalogSourceDocument" (
	"snapshotId" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "catalogSourceDocument_snapshotId_sourceUrl_pk" PRIMARY KEY("snapshotId","sourceUrl")
);
--> statement-breakpoint
ALTER TABLE "catalogCourse" ADD CONSTRAINT "catalogCourse_snapshotId_catalogSnapshot_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."catalogSnapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogProgram" ADD CONSTRAINT "catalogProgram_snapshotId_catalogSnapshot_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."catalogSnapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogSourceDocument" ADD CONSTRAINT "catalogSourceDocument_snapshotId_catalogSnapshot_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."catalogSnapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_snapshot_one_active" ON "catalogSnapshot" USING btree ("status") WHERE "catalogSnapshot"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "plan_one_active_per_user" ON "plan" USING btree ("userId") WHERE "plan"."isActive" = true;