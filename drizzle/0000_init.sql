CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	`impersonatedBy` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`banReason` text,
	`banExpires` integer,
	`rollNo` text,
	`dept` text,
	`year` integer,
	`phone` text,
	`hostelId` text,
	`roomId` text,
	`gender` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_rollNo_unique` ON `user` (`rollNo`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE `complaint_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`complaintId` text NOT NULL,
	`r2Key` text NOT NULL,
	`kind` text DEFAULT 'before' NOT NULL,
	`mimeType` text,
	`sizeBytes` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `complaints` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`studentId` text NOT NULL,
	`hostelId` text NOT NULL,
	`roomId` text,
	`floor` integer,
	`roomLabel` text,
	`category` text NOT NULL,
	`subType` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`confidential` integer DEFAULT false NOT NULL,
	`assigneeId` text,
	`slaDueAt` integer,
	`overdue` integer DEFAULT false NOT NULL,
	`resolvedAt` integer,
	`closedAt` integer,
	`rating` integer,
	`ratingNote` text,
	`duplicateOfId` text,
	`upvotes` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`studentId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hostelId`) REFERENCES `hostels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigneeId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hostels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'boys' NOT NULL,
	`floors` integer DEFAULT 3 NOT NULL,
	`wardenId` text,
	`caretakerName` text,
	`caretakerPhone` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`hostelId` text NOT NULL,
	`floor` integer NOT NULL,
	`roomNo` text NOT NULL,
	`capacity` integer DEFAULT 3 NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`hostelId`) REFERENCES `hostels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`complaintId` text NOT NULL,
	`actorId` text,
	`actorRole` text,
	`fromStatus` text,
	`toStatus` text,
	`remark` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`complaintId` text NOT NULL,
	`authorId` text NOT NULL,
	`body` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `counters` (
	`id` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`hostelId` text,
	`authorId` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sla_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`respondHours` integer NOT NULL,
	`resolveHours` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `upvotes` (
	`id` text PRIMARY KEY NOT NULL,
	`complaintId` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`complaintId`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
