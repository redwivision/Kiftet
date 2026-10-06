CREATE TABLE "waitlist_signup" (
	"seq" serial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"activation_token" text NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"founding_price_etb" integer,
	"promise_version" text NOT NULL,
	"promise_snapshot" jsonb NOT NULL,
	"telegram_chat_id" bigint,
	"activated_at" timestamp,
	"testimonial_text" text,
	"testimonial_at" timestamp,
	"testimonial_published_at" timestamp,
	"premium_starts_at" timestamp,
	"premium_ends_at" timestamp,
	"consent_at" timestamp NOT NULL,
	"consent_version" text NOT NULL,
	"referrer_phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signup_phone_uidx" ON "waitlist_signup" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signup_activation_uidx" ON "waitlist_signup" USING btree ("activation_token");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signup_seq_uidx" ON "waitlist_signup" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "waitlist_signup_eligible_idx" ON "waitlist_signup" USING btree ("activated_at","testimonial_at");