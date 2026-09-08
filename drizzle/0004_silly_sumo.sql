CREATE TABLE `room_chunks` (
	`user_id` text NOT NULL,
	`part` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`user_id`, `part`)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	`onboarded` integer DEFAULT 0 NOT NULL,
	`image_key` text,
	`updated_at` integer NOT NULL
);
