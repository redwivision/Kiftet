-- Versioned base-content cache and attempted plan-step checks.
CREATE TABLE "plan_content" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"concept_text" text NOT NULL,
	"step_type" text NOT NULL,
	"language" text NOT NULL,
	"plan_version" integer NOT NULL,
	"body" jsonb NOT NULL,
	"contrast" jsonb,
	"chapter_explains" boolean,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "plan_content_chapter_concept_type_language_version_unique" UNIQUE("chapter_id","concept_text","step_type","language","plan_version")
);
--> statement-breakpoint
ALTER TABLE "plan_content" ADD CONSTRAINT "plan_content_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_content_chapter_idx" ON "plan_content" USING btree ("chapter_id");
--> statement-breakpoint
CREATE TABLE "plan_step_check" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"concept_text" text NOT NULL,
	"response_text" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "plan_step_check_session_concept_unique" UNIQUE("session_id","concept_text")
);
--> statement-breakpoint
ALTER TABLE "plan_step_check" ADD CONSTRAINT "plan_step_check_session_id_study_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_session"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "plan_step_check_session_idx" ON "plan_step_check" USING btree ("session_id");