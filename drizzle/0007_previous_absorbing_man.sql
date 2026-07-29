CREATE TABLE "announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tone" text DEFAULT 'info' NOT NULL,
	"linkUrl" text,
	"linkLabel" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"publishedAt" timestamp,
	"expiresAt" timestamp,
	"createdBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_one_published" ON "announcement" USING btree ("status") WHERE "announcement"."status" = 'published';--> statement-breakpoint
CREATE INDEX "announcement_created_at" ON "announcement" USING btree ("createdAt");