import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
		sortOrder: integer("sort_order").default(0).notNull(),
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
		retestQuestions: jsonb("retest_questions").$type<{ question: string; focus: string[] }[] | null>(),
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

export const syllabusUnitRelations = relations(syllabusUnit, ({ one, many }) => ({
	syllabus: one(syllabus, {
		fields: [syllabusUnit.syllabusId],
		references: [syllabus.id],
	}),
	chapters: many(chapter),
}));

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

export const studySessionRelations = relations(studySession, ({ one, many }) => ({
	user: one(user, {
		fields: [studySession.userId],
		references: [user.id],
	}),
	chapter: one(chapter, {
		fields: [studySession.chapterId],
		references: [chapter.id],
	}),
	attempts: many(attempt),
}));

export const attemptRelations = relations(attempt, ({ one }) => ({
	session: one(studySession, {
		fields: [attempt.sessionId],
		references: [studySession.id],
	}),
}));