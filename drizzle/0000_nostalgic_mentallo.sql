CREATE TABLE `connections` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`credentials` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_identity` ON `connections` (`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listens` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`source` text NOT NULL,
	`played_at` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`album` text NOT NULL,
	`duration_ms` integer,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `listens_owner_source_date` ON `listens` (`user_id`,`source`,`played_at`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`page` integer DEFAULT 1 NOT NULL,
	`cutoff` integer NOT NULL,
	`since` integer DEFAULT 0 NOT NULL,
	`latest` integer DEFAULT 0 NOT NULL,
	`phase` text DEFAULT 'backfill' NOT NULL,
	`next_run` integer DEFAULT 0 NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL,
	`last_success` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `system_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
