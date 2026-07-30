CREATE TABLE "siteAbout" (
	"id" text PRIMARY KEY DEFAULT 'site' NOT NULL,
	"content" jsonb NOT NULL,
	"updatedBy" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "siteAbout" ADD CONSTRAINT "siteAbout_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;