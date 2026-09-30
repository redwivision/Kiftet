ALTER TABLE "textbook" ADD COLUMN "source_name" text;
--> statement-breakpoint
ALTER TABLE "textbook" ADD COLUMN "source_size" integer;
--> statement-breakpoint
ALTER TABLE "textbook" ADD COLUMN "toc" jsonb;
