DROP INDEX "waitlist_signup_eligible_idx";--> statement-breakpoint
ALTER TABLE "waitlist_signup" ADD COLUMN "channel_verified_at" timestamp;--> statement-breakpoint
CREATE INDEX "waitlist_signup_eligible_idx" ON "waitlist_signup" USING btree ("channel_verified_at","testimonial_at");