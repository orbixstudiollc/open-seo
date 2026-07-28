CREATE TABLE `ai_mention_scoring_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`answer_id` text NOT NULL,
	`run_id` text NOT NULL,
	`provider_kind` text NOT NULL,
	`model_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_usd` real,
	`cost_basis` text DEFAULT 'unknown' NOT NULL,
	`input_usd_per_million` real,
	`output_usd_per_million` real,
	`error_code` text,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`answer_id`) REFERENCES `ai_answers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_mention_scoring_attempts_answer_version_idx` ON `ai_mention_scoring_attempts` (`answer_id`,`prompt_version`);--> statement-breakpoint
CREATE INDEX `ai_mention_scoring_attempts_run_started_idx` ON `ai_mention_scoring_attempts` (`run_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `ai_brand_mentions` ADD `sentiment` text;--> statement-breakpoint
ALTER TABLE `ai_brand_mentions` ADD `position` integer;--> statement-breakpoint
ALTER TABLE `ai_brand_mentions` ADD `first_occurrence_start` integer;--> statement-breakpoint
ALTER TABLE `ai_brand_mentions` ADD `first_occurrence_end` integer;--> statement-breakpoint
ALTER TABLE `ai_brand_mentions` ADD `scoring_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_brand_mentions` ADD `scoring_attempt_id` text REFERENCES ai_mention_scoring_attempts(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `ai_brand_mentions` ADD `scored_at` text;
