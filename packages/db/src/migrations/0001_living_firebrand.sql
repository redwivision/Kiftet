CREATE TABLE "syllabus" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"grade" integer NOT NULL,
	"title" text NOT NULL,
	"source" text DEFAULT 'provisional' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabus_unit" (
	"id" text PRIMARY KEY NOT NULL,
	"syllabus_id" text NOT NULL,
	"unit_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter" ADD COLUMN "unit_id" text;--> statement-breakpoint
ALTER TABLE "syllabus_unit" ADD CONSTRAINT "syllabus_unit_syllabus_id_syllabus_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "syllabus_unit_syllabusId_idx" ON "syllabus_unit" USING btree ("syllabus_id");--> statement-breakpoint
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_unit_id_syllabus_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."syllabus_unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_unitId_idx" ON "chapter" USING btree ("unit_id");