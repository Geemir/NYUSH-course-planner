CREATE TABLE "course" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text,
	"title" text NOT NULL,
	"credits" integer NOT NULL,
	"data" jsonb NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
