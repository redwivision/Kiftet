import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The launch waitlist — the one table that must never fail.
 *
 * Everything about this schema is shaped by three constraints that came out of
 * the spike assessment rather than out of a data-modelling exercise:
 *
 *  - **It is not an account.** A waitlist entry is not a user, has no
 *    password, and must be erasable under PDPL without touching an auth row.
 *    That is why it lives beside `user` rather than inside it: deletion of
 *    marketing data is a legal obligation that has to be able to be carried out
 *    on its own.
 *
 *  - **`seq` is the identity that matters, not `id`.** `id` is a UUID for
 *    dedupe on the client; `seq` is a Postgres sequence, so it is monotonic
 *    without ever taking a row lock. A counter row (`UPDATE n = n+1`) would
 *    serialise every signup into one contended row — precisely the bottleneck
 *    the waitlist exists to avoid. Wave number is *derived* from `seq` rather
 *    than stored, so it can never drift out of sync with it.
 *
 *  - **The promise is stored, not remembered.** `founding_price_etb` and
 *    `promise_snapshot` freeze exactly what this person was told at the moment
 *    they signed up. Without them, "founding price" is a memory, and at launch
 *    you have N people and no record of what you said to any of them.
 */

export const waitlistSignup = pgTable(
  "waitlist_signup",
  {
    // Monotonic admission order. Never reused, never renumbered — deleting a
    // spam row must not shift anyone else's place. Concurrent transactions can
    // still *commit* out of sequence order, so treat `seq` as a fair-shuffle
    // rather than a strict arrival log; it is a launch-staging knob, not a
    // leaderboard.
    seq: serial("seq").notNull(),
    id: text("id").primaryKey(),
    /** Opaque token carried in the Telegram deep link. See the note below. */
    activationToken: text("activation_token").notNull(),

    // E.164 (`+2519XXXXXXXXX`). The identity, and the dedupe key — so the
    // normalisation it depends on is load-bearing, not cosmetic. See
    // apps/server/src/lib/phone.ts.
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    /** The app's language pref, so launch-day contact needs no translation. */
    language: text("language").notNull().default("en"),

    // ── The promise, frozen at signup ──
    foundingPriceEtb: integer("founding_price_etb"),
    promiseVersion: text("promise_version").notNull(),
    promiseSnapshot: jsonb("promise_snapshot").notNull(),

    // ── The two conditions that earn the reward ──
    // Kept as two independent facts rather than one `qualified` boolean, so
    // eligibility is a query you can audit and a student can see their own
    // progress against. A stored boolean drifts; these cannot.
    //
    // The activation token is separate from `id` on purpose. `id` is the
    // capability that reads this person's status; `activationToken` is the value
    // that appears in a Telegram deep link, which travels further — into
    // browser history, screenshots, and copy-pasted messages. One leaked token
    // should not hand over both. It is random and stored rather than derived,
    // because the webhook has to resolve it in a single indexed lookup.
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
    /** They pressed Start in the bot. Proves the bot was reached, nothing more. */
    activatedAt: timestamp("activated_at"),
    /**
     * Telegram confirmed they are actually in the channel.
     *
     * Separate from `activatedAt` because those are different claims, and
     * conflating them made the reward claimable by pressing a button. The check
     * is re-run when the testimonial arrives, not only at `/start`, because
     * joining the channel after tapping the button is the normal order and
     * failing them for it would be a rule nobody was told.
     *
     * Null forever if the bot lacks admin rights in the channel — see
     * RUNBOOK.md. That degrades the gate to "trusted us", never to "everyone
     * qualifies".
     */
    channelVerifiedAt: timestamp("channel_verified_at"),
    testimonialText: text("testimonial_text"),
    testimonialAt: timestamp("testimonial_at"),
    /** Set only after a human approves the wording. Not self-published. */
    testimonialPublishedAt: timestamp("testimonial_published_at"),
    /**
     * When an operator was last handed this testimonial.
     *
     * Separate from `testimonialPublishedAt` because being *told* an opinion
     * and *publishing* it are different decisions. `telegram:testimonials`
     * writes it so a re-run sends only the new lines, not the whole pile again.
     */
    testimonialSentAt: timestamp("testimonial_sent_at"),

    // ── The reward ──
    // Materialised at launch from the two facts above, once, by an operator
    // with eyes on the list. Null until then.
    premiumStartsAt: timestamp("premium_starts_at"),
    premiumEndsAt: timestamp("premium_ends_at"),

    // PDPL 1321/2024: the lawful basis is recorded, not assumed, and the
    // version lets a later policy change be distinguished from this consent.
    consentAt: timestamp("consent_at").notNull(),
    consentVersion: text("consent_version").notNull(),
    referrerPhone: text("referrer_phone"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // The dedupe constraint. One person, one row — a double-tap on school
    // wi-fi must return their existing wave, not an error or a duplicate.
    uniqueIndex("waitlist_signup_phone_uidx").on(table.phone),
    uniqueIndex("waitlist_signup_activation_uidx").on(table.activationToken),
    // Backs wave derivation and the staged launch query (`seq >= ?`). Unique
    // because wave ordering reads as a total order, and a tie would make
    // "who is in wave 3" ambiguous on the one day it has to be right.
    uniqueIndex("waitlist_signup_seq_uidx").on(table.seq),
    // Backs the launch-day "who gets premium" audit — the one query that has
    // to be both fast and correct on the day it is run. Indexed on the two
    // columns eligibility is actually derived from, which is why
    // `channelVerifiedAt` replaced `activatedAt` here.
    index("waitlist_signup_eligible_idx").on(
      table.channelVerifiedAt,
      table.testimonialAt,
    ),
  ],
);

export type WaitlistSignup = typeof waitlistSignup.$inferSelect;
