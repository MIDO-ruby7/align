ALTER TABLE `spaces` ADD `invite_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_invite_token_unique` ON `spaces` (`invite_token`);