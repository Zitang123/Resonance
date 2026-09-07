CREATE TABLE `lastfm_archive_budget` (
	`id` integer PRIMARY KEY NOT NULL,
	`bytes` integer NOT NULL,
	CONSTRAINT "lastfm_archive_singleton" CHECK("lastfm_archive_budget"."id" = 1),
	CONSTRAINT "lastfm_archive_limit" CHECK("lastfm_archive_budget"."bytes" >= 0 AND "lastfm_archive_budget"."bytes" <= 80000000)
);
