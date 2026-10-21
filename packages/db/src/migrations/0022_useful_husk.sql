CREATE TABLE "study_position" (
	"id" text PRIMARY KEY NOT NULL,
	"textbook_id" text NOT NULL,
	"chapter_id" text,
	"topic_path" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "review_preference" text DEFAULT 'light' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "exam_date" date;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "daily_minutes" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "placement_dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "study_position" ADD CONSTRAINT "study_position_textbook_id_textbook_id_fk" FOREIGN KEY ("textbook_id") REFERENCES "public"."textbook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_position" ADD CONSTRAINT "study_position_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "study_position_textbookId_uidx" ON "study_position" USING btree ("textbook_id");