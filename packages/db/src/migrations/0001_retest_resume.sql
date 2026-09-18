ALTER TABLE `study_session` ADD `retest_questions` text;
--> statement-breakpoint
ALTER TABLE `study_session` ADD `retest_index` integer DEFAULT 0 NOT NULL;
