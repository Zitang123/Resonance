CREATE TABLE `archive_owners` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `source`)
);
