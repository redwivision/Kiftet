import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const textbook = pgTable("textbook", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const syllabus = pgTable("syllabus", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  grade: integer("grade").notNull(),
  title: text("title").notNull(),
  // "provisional" until a teacher verifies the unit list (STRATEGY.md bet 1);
  // flips to "verified" once checked. Never shipped to students as final.
  source: text("source").notNull().default("provisional"),
  // The audit trail behind `source` — the textbook/syllabus the unit list was
  // compiled from, so "verified" can always be checked against its basis.
  sourceNote: text("source_note"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const syllabusUnit = pgTable(
  "syllabus_unit",
  {
    id: text("id").primaryKey(),
    syllabusId: text("syllabus_id")
      .notNull()
      .references(() => syllabus.id, { onDelete: "cascade" }),
    unitNumber: integer("unit_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // Teaching periods the official MoE document allots to this unit. This is
    // the state's own weighting, transcribed from the syllabus — the single
    // most copy-resistant datum we can hold, because nobody can guess it (see
    // docs/SYLLABUS.md §4). NULL means "the document did not state one for this
    // unit", which is meaningfully different from 0 and must never be
    // defaulted: a fabricated allocation would silently drive prioritisation.
    periods: integer("periods"),
    // Provenance for `periods` specifically, same discipline as
    // `syllabus.sourceNote`: which document and page the figure came from, so
    // it can always be checked. Kept separate from the unit-level source
    // because a period count is a narrower claim than a unit list.
    periodsSource: text("periods_source"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("syllabus_unit_syllabusId_idx").on(table.syllabusId)],
);

export const chapter = pgTable(
  "chapter",
  {
    id: text("id").primaryKey(),
    textbookId: text("textbook_id")
      .notNull()
      .references(() => textbook.id, { onDelete: "cascade" }),
    unitId: text("unit_id").references(() => syllabusUnit.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    rawText: text("raw_text").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("chapter_textbookId_idx").on(table.textbookId),
    index("chapter_unitId_idx").on(table.unitId),
  ],
);

export const conceptNode = pgTable(
  "concept_node",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapter.id, { onDelete: "cascade" }),
    conceptText: text("concept_text").notNull(),
    isMisconception: boolean("is_misconception").default(false).notNull(),
    weight: integer("weight").default(1).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("concept_node_chapterId_idx").on(table.chapterId)],
);

/**
 * One concept's teaching section, generated once per (chapter, concept,
 * language) and shared by every student.
 *
 * This is the whole phase in one table. A guide section depends on the chapter
 * text and the language, never on the student, so the Gemini free tier (a
 * per-project quota, not a per-key one) is paid once per concept instead of
 * once per session. Ordering, "focus here" and "already solid" are derived from
 * mastery at read time.
 *
 * `whatText` / `whyText` / `recallText` replace the single lesson string: a
 * student can read the parts in order, and each one can be retested on its own
 * later. `sourceOffset` / `sourceQuote` anchor the section back into
 * `chapter.rawText` so the guide can route a student to the exact place in
 * their own book. `estimated` marks a section built by the deterministic
 * fallback rather than the model.
 */
export const guideSection = pgTable(
  "guide_section",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapter.id, { onDelete: "cascade" }),
    conceptText: text("concept_text").notNull(),
    language: text("language").default("en").notNull(),
    whatText: text("what_text").notNull(),
    whyText: text("why_text"),
    recallText: text("recall_text"),
    sourceOffset: integer("source_offset"),
    sourceQuote: text("source_quote"),
    estimated: boolean("estimated").default(false).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // The dedupe that makes the cache possible: one row per
    // (chapter, concept, language), so two students on the same chapter cost
    // one call, not two.
    unique("guide_section_chapter_concept_language_unique").on(
      table.chapterId,
      table.conceptText,
      table.language,
    ),
    index("guide_section_chapterId_idx").on(table.chapterId),
  ],
);

export const studySession = pgTable(
  "study_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapter.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at")
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: timestamp("completed_at"),
    retestQuestions: jsonb("retest_questions").$type<
      { question: string; focus: string[] }[] | null
    >(),
    retestIndex: integer("retest_index").default(0).notNull(),
    status: text("status", { enum: ["in_progress", "completed"] })
      .default("in_progress")
      .notNull(),
  },
  (table) => [
    index("study_session_userId_idx").on(table.userId),
    index("study_session_chapterId_idx").on(table.chapterId),
  ],
);

export type AttemptGaps = {
  covered: string[];
  missing: string[];
  misconceptions: string[];
};

export const attempt = pgTable(
  "attempt",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => studySession.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: ["recall", "retest"] }).notNull(),
    transcriptText: text("transcript_text"),
    gapsIdentified: jsonb("gaps_identified").$type<AttemptGaps>().notNull(),
    score: integer("score"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("attempt_sessionId_idx").on(table.sessionId)],
);

export const textbookRelations = relations(textbook, ({ many }) => ({
  chapters: many(chapter),
}));

export const syllabusRelations = relations(syllabus, ({ many }) => ({
  units: many(syllabusUnit),
}));

export const syllabusUnitRelations = relations(
  syllabusUnit,
  ({ one, many }) => ({
    syllabus: one(syllabus, {
      fields: [syllabusUnit.syllabusId],
      references: [syllabus.id],
    }),
    chapters: many(chapter),
  }),
);

export const chapterRelations = relations(chapter, ({ one, many }) => ({
  textbook: one(textbook, {
    fields: [chapter.textbookId],
    references: [textbook.id],
  }),
  unit: one(syllabusUnit, {
    fields: [chapter.unitId],
    references: [syllabusUnit.id],
  }),
  concepts: many(conceptNode),
}));

export const conceptNodeRelations = relations(conceptNode, ({ one }) => ({
  chapter: one(chapter, {
    fields: [conceptNode.chapterId],
    references: [chapter.id],
  }),
}));

export const guideSectionRelations = relations(guideSection, ({ one }) => ({
  chapter: one(chapter, {
    fields: [guideSection.chapterId],
    references: [chapter.id],
  }),
}));

export const studySessionRelations = relations(
  studySession,
  ({ one, many }) => ({
    user: one(user, {
      fields: [studySession.userId],
      references: [user.id],
    }),
    chapter: one(chapter, {
      fields: [studySession.chapterId],
      references: [chapter.id],
    }),
    attempts: many(attempt),
  }),
);

export const attemptRelations = relations(attempt, ({ one }) => ({
  session: one(studySession, {
    fields: [attempt.sessionId],
    references: [studySession.id],
  }),
}));

// ─── Bet 2: the national misconception map (STRATEGY.md) ─────────────
// One row = one time a grader saw a known misconception surface in a real
// session. Aggregate-only: never returned with a user, and reads enforce a
// k-anonymity floor so a small group of students can't be de-anonymized.
export const misconceptionHit = pgTable(
  "misconception_hit",
  {
    id: text("id").primaryKey(),
    conceptNodeId: text("concept_node_id")
      .notNull()
      .references(() => conceptNode.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => studySession.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // The same misconception can only count once per session — a retry or a
    // replay must never double-count. Different students each add their own.
    uniqueIndex("misconception_hit_session_concept_uidx").on(
      table.sessionId,
      table.conceptNodeId,
    ),
    index("misconception_hit_userId_idx").on(table.userId),
  ],
);

export const misconceptionHitRelations = relations(
  misconceptionHit,
  ({ one }) => ({
    conceptNode: one(conceptNode, {
      fields: [misconceptionHit.conceptNodeId],
      references: [conceptNode.id],
    }),
    session: one(studySession, {
      fields: [misconceptionHit.sessionId],
      references: [studySession.id],
    }),
    user: one(user, {
      fields: [misconceptionHit.userId],
      references: [user.id],
    }),
  }),
);
