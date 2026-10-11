ALTER TABLE `comments` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `kind` text DEFAULT 'message' NOT NULL;