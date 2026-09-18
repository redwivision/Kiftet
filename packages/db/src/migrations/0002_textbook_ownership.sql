ALTER TABLE `textbook` ADD `owner_id` text REFERENCES `user`(`id`) ON DELETE cascade;
--> statement-breakpoint
UPDATE `textbook` SET `owner_id` = (SELECT `id` FROM `user` ORDER BY `created_at` LIMIT 1);
--> statement-breakpoint
CREATE INDEX `textbook_ownerId_idx` ON `textbook` (`owner_id`);
