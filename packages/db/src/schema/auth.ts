import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Who a `user` row actually is. A real, signed-up student is a `student`; a
// throwaway identity minted by /demo/start for an anonymous visitor is a
// `demo`. This is the discriminator that lets real-user analytics (and the
// national misconception map) exclude demo traffic without a table split — the
// study spine stays keyed on `user.id`, and a demo row is reclassified on the
// backfill of migration 0011 rather than moved. Better Auth knows nothing about
// this column, so every signup takes the `student` default; only /demo/start
// writes `demo`. See docs/howItWorks/security.md §"Demo identity".
export const USER_KINDS = ["student", "demo"] as const;
export type UserKind = (typeof USER_KINDS)[number];

/**
 * How much of the past the student wants to review.
 *
 * Review is a question, not a default to impose: a student who wants to press
 * on new material should not be handed yesterday's gaps every morning. The
 * student says, and the plan follows.
 *
 * - `none` — no review at all, until an exam date gives it a reason.
 * - `light` — a short review of what is nearly forgotten.
 * - `heavy` — a real review block, with more of the past brought back.
 */
export const REVIEW_PREFERENCES = ["none", "light", "heavy"] as const;
export type ReviewPreference = (typeof REVIEW_PREFERENCES)[number];

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  kind: text("kind", { enum: USER_KINDS }).default("student").notNull(),
  /**
   * The moment this account accepted the current terms, and which version it
   * accepted.
   *
   * Stamped by Better Auth's user-create database hook rather than trusted from
   * the sign-up request: the form's checkbox is what a person sees, but the
   * row is the record we can actually stand behind. Social sign-in has no
   * checkbox — the "continue with" copy is the notice, and this hook gives it
   * the same audit trail as email sign-up. Existing rows stay NULL because
   * backfilling consent would invent an act nobody performed.
   */
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  termsVersion: text("terms_version"),
  /**
   * How much past material the student wants brought back.
   *
   * `light` is the default because a student who has said nothing is more
   * likely to want a little review than none, and because the plan can turn it
   * off the moment they say so.
   */
  reviewPreference: text("review_preference", {
    enum: REVIEW_PREFERENCES,
  })
    .default("light")
    .notNull(),
  /**
   * The exam this student is preparing for, if they have told us.
   *
   * It is what turns review on for someone who chose none: with a date on the
   * calendar, forgetting something has a consequence, and the plan says so. It
   * is also what makes "how much is left" answerable.
   *
   * A calendar date, not a timestamp. An exam is a day, and the student counts
   * the days left from their own midnight — storing a time of day would mean
   * one of two answers is always slightly wrong.
   */
  examDate: date("exam_date", { mode: "string" }),
  /**
   * The default length of a study day, in minutes.
   *
   * Twenty is a default, not a rule: the student changes it, and the Today
   * screen can change it for a single day without changing the habit.
   */
  dailyMinutes: integer("daily_minutes").default(20).notNull(),
  /**
   * Whether the student has declined to say where they are.
   *
   * Placement is asked once, and the answer is that asking again is nagging.
   * The student can set it later from Settings.
   */
  placementDismissed: boolean("placement_dismissed").default(false).notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("account_providerId_accountId_uidx").on(
      table.providerId,
      table.accountId,
    ),
    index("account_userId_idx").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
