CREATE TABLE "study_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_session" ADD COLUMN "queue_id" text;--> statement-breakpoint
ALTER TABLE "study_session" ADD COLUMN "queue_position" integer;--> statement-breakpoint
ALTER TABLE "study_queue" ADD CONSTRAINT "study_queue_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_queue_userId_idx" ON "study_queue" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_queue_id_study_queue_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."study_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_session_queueId_idx" ON "study_session" USING btree ("queue_id");