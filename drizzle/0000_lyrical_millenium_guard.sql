CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`source_lang` text NOT NULL,
	`detected_lang` text,
	`target_langs` text NOT NULL,
	`duration_sec` real DEFAULT 0 NOT NULL,
	`media_type` text NOT NULL,
	`media_uploaded` integer DEFAULT false NOT NULL,
	`audio_chunks` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_user` ON `projects` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`start` real NOT NULL,
	`end` real NOT NULL,
	`text` text NOT NULL,
	`speaker` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `segments_project` ON `segments` (`project_id`,`position`);--> statement-breakpoint
CREATE TABLE `speakers` (
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`voice` text DEFAULT 'standard' NOT NULL,
	`speed` real DEFAULT 1 NOT NULL,
	`similarity` real DEFAULT 0.75 NOT NULL,
	`cloned_voice_id` text,
	PRIMARY KEY(`project_id`, `name`)
);
--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`lang` text NOT NULL,
	`translation` text,
	`keep_as_is` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `terms_user` ON `terms` (`user_id`,`lang`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`project_id` text NOT NULL,
	`lang` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`error` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`mixed_revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`project_id`, `lang`)
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`segment_id` text NOT NULL,
	`project_id` text NOT NULL,
	`lang` text NOT NULL,
	`text` text NOT NULL,
	`clip_key` text,
	`needs_redub` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`segment_id`, `lang`)
);
--> statement-breakpoint
CREATE INDEX `translations_project` ON `translations` (`project_id`,`lang`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
