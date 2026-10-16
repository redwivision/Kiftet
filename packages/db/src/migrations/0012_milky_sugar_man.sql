CREATE TABLE "chapter_objective" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"objective_text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_offset" integer,
	"source_quote" text,
	"estimated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_objective" ADD CONSTRAINT "chapter_objective_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_objective_chapterId_idx" ON "chapter_objective" USING btree ("chapter_id");