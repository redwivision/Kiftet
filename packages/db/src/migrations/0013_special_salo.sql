ALTER TABLE "study_session" ADD COLUMN "recall_mode" text DEFAULT 'blurting';--> statement-breakpoint
ALTER TABLE "study_session" ADD COLUMN "recall_questions" jsonb;--> statement-breakpoint
ALTER TABLE "study_session" ADD COLUMN "recall_index" integer DEFAULT 0 NOT NULL;