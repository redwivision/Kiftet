ALTER TABLE "study_session" ADD COLUMN "pretest_questions" jsonb;--> statement-breakpoint
ALTER TABLE "study_session" ADD COLUMN "pretest_index" integer DEFAULT 0 NOT NULL;