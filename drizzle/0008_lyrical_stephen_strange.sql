CREATE TABLE "catalogOverlayEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"overlayId" text NOT NULL,
	"actorUserId" text,
	"eventType" text NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogOverlay" ALTER COLUMN "requestId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogOverlay" ADD COLUMN "origin" text DEFAULT 'correction' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalogOverlay" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "catalogOverlayEvent" ADD CONSTRAINT "catalogOverlayEvent_overlayId_catalogOverlay_id_fk" FOREIGN KEY ("overlayId") REFERENCES "public"."catalogOverlay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogOverlayEvent" ADD CONSTRAINT "catalogOverlayEvent_actorUserId_user_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_overlay_event_overlay_time" ON "catalogOverlayEvent" USING btree ("overlayId","createdAt");