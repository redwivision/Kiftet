CREATE TABLE "ai_admission" (
	"provider" text PRIMARY KEY NOT NULL,
	"tokens" real NOT NULL,
	"last_refill_at" timestamp with time zone NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"open_until" timestamp with time zone,
	"admitted" bigint DEFAULT 0 NOT NULL,
	"shed_busy" bigint DEFAULT 0 NOT NULL,
	"shed_saturated" bigint DEFAULT 0 NOT NULL,
	"shed_circuit" bigint DEFAULT 0 NOT NULL
);
