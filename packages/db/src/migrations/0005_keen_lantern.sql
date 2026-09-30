-- Phase 11, step 3b: per-concept guide sections.
--
-- The Gemini free tier is a per-PROJECT quota, not a per-key one, so a guide
-- regenerated per session is unaffordable: ~12 calls to show one guide, shared
-- by every user. The fix is to notice that a concept section depends on the
-- chapter text and the language, and NOT on the student -- so generate it once
-- per (chapter, concept, language) and share it. Ordering and "focus here"
-- badges are computed from mastery at read time and cost nothing.
--
-- source_offset/source_quote anchor the section back into chapter.raw_text so
-- the guide can route a student to the exact place in their own book, which is
-- the whole point of a study plan that hands you back to your textbook.
--
-- "what"/"why"/"recall" replace the single "lesson_text" string: a student can
-- read a structured section in order, and each part can be re-rendered or
-- retested on its own later.
--
-- estimated = true means the section came from the deterministic lexical
-- fallback, not the model. It must be shown as an estimate, never as a lesson.
CREATE TABLE IF NOT EXISTS "guide_section" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"concept_text" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"what_text" text NOT NULL,
	"why_text" text,
	"recall_text" text,
	"source_offset" integer,
	"source_quote" text,
	"estimated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guide_section_chapter_concept_language_unique" UNIQUE("chapter_id","concept_text","language")
);
--> statement-breakpoint
ALTER TABLE "guide_section" ADD CONSTRAINT "guide_section_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "chapter"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guide_section_chapterId_idx" ON "guide_section" USING btree ("chapter_id");
