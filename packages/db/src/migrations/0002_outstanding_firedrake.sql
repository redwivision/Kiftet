CREATE TABLE "misconception_hit" (
	"id" text PRIMARY KEY NOT NULL,
	"concept_node_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "misconception_hit" ADD CONSTRAINT "misconception_hit_concept_node_id_concept_node_id_fk" FOREIGN KEY ("concept_node_id") REFERENCES "public"."concept_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_hit" ADD CONSTRAINT "misconception_hit_session_id_study_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_hit" ADD CONSTRAINT "misconception_hit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "misconception_hit_session_concept_uidx" ON "misconception_hit" USING btree ("session_id","concept_node_id");--> statement-breakpoint
CREATE INDEX "misconception_hit_userId_idx" ON "misconception_hit" USING btree ("user_id");