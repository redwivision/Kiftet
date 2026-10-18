ALTER TABLE "chapter" ADD COLUMN "topics" jsonb;--> statement-breakpoint
ALTER TABLE "chapter" ADD COLUMN "extracted_at" timestamp with time zone;