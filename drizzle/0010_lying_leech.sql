CREATE TABLE "translationCache" (
	"id" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"sourceText" text NOT NULL,
	"translatedText" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "translation_cache_locale" ON "translationCache" USING btree ("locale");