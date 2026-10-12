ALTER TABLE "user" ADD COLUMN "kind" text DEFAULT 'student' NOT NULL;
--> statement-breakpoint
UPDATE "user" SET "kind" = 'demo' WHERE "email" LIKE '%@demo.kiftet';