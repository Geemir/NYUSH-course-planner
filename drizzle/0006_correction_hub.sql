CREATE TABLE "catalogOverlay" (
	"id" text PRIMARY KEY NOT NULL,
	"requestId" text NOT NULL,
	"targetKind" text NOT NULL,
	"targetKey" text NOT NULL,
	"patchType" text NOT NULL,
	"patchData" jsonb NOT NULL,
	"sourceReleaseId" text,
	"status" text DEFAULT 'active' NOT NULL,
	"appliedBy" text,
	"appliedAt" timestamp DEFAULT now() NOT NULL,
	"supersededAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correctionEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"requestId" text NOT NULL,
	"actorUserId" text,
	"eventType" text NOT NULL,
	"fromStatus" text,
	"toStatus" text,
	"publicNote" text,
	"privateNote" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correctionMessage" (
	"id" text PRIMARY KEY NOT NULL,
	"requestId" text NOT NULL,
	"authorUserId" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correctionRequest" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"targetKind" text NOT NULL,
	"targetData" jsonb NOT NULL,
	"issueType" text NOT NULL,
	"catalogReleaseId" text,
	"contextData" jsonb NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"suggestedCorrection" text,
	"evidenceUrl" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"assignedTo" text,
	"duplicateOfId" text,
	"withdrawnAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"closedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"kind" text NOT NULL,
	"requestId" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogOverlay" ADD CONSTRAINT "catalogOverlay_requestId_correctionRequest_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."correctionRequest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogOverlay" ADD CONSTRAINT "catalogOverlay_appliedBy_user_id_fk" FOREIGN KEY ("appliedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correctionEvent" ADD CONSTRAINT "correctionEvent_requestId_correctionRequest_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."correctionRequest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correctionEvent" ADD CONSTRAINT "correctionEvent_actorUserId_user_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correctionMessage" ADD CONSTRAINT "correctionMessage_requestId_correctionRequest_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."correctionRequest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correctionMessage" ADD CONSTRAINT "correctionMessage_authorUserId_user_id_fk" FOREIGN KEY ("authorUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correctionRequest" ADD CONSTRAINT "correctionRequest_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correctionRequest" ADD CONSTRAINT "correctionRequest_assignedTo_user_id_fk" FOREIGN KEY ("assignedTo") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_requestId_correctionRequest_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."correctionRequest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_overlay_request_unique" ON "catalogOverlay" USING btree ("requestId");--> statement-breakpoint
CREATE INDEX "catalog_overlay_active_target" ON "catalogOverlay" USING btree ("status","targetKind","targetKey");--> statement-breakpoint
CREATE INDEX "correction_event_request_time" ON "correctionEvent" USING btree ("requestId","createdAt");--> statement-breakpoint
CREATE INDEX "correction_message_request_time" ON "correctionMessage" USING btree ("requestId","createdAt");--> statement-breakpoint
CREATE INDEX "correction_owner_updated" ON "correctionRequest" USING btree ("userId","updatedAt");--> statement-breakpoint
CREATE INDEX "correction_status_created" ON "correctionRequest" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "correction_target" ON "correctionRequest" USING btree ("targetKind");--> statement-breakpoint
CREATE INDEX "notification_user_unread" ON "notification" USING btree ("userId","readAt","createdAt");