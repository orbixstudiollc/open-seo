CREATE TABLE `ai_project_run_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`answer_call_cap` integer DEFAULT 200 NOT NULL,
	`window_started_at` text,
	`calls_reserved` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tracked_prompt_id` text NOT NULL,
	`prompt_text` text NOT NULL,
	`model` text NOT NULL,
	`model_name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_text` text,
	`error_code` text,
	`error_message` text,
	`cache_key` text,
	`source_fetched_at` text,
	`observed_at` text DEFAULT (current_timestamp) NOT NULL,
	`output_tokens` integer,
	`web_search` integer,
	`from_cache` integer DEFAULT false NOT NULL,
	`billing_path` text,
	`provider_cost_usd` real,
	`credits_consumed` integer,
	`attempt_started_at` text,
	`completed_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ai_answers`("id", "run_id", "tracked_prompt_id", "prompt_text", "model", "model_name", "status", "response_text", "error_code", "error_message", "cache_key", "source_fetched_at", "observed_at", "output_tokens", "web_search", "provider_cost_usd") SELECT "id", "run_id", "tracked_prompt_id", "prompt_text", "model", "model_name", "status", "response_text", "error_code", "error_message", "cache_key", "source_fetched_at", "observed_at", "output_tokens", "web_search", "provider_cost_usd" FROM `ai_answers`;--> statement-breakpoint
DROP TABLE `ai_answers`;--> statement-breakpoint
ALTER TABLE `__new_ai_answers` RENAME TO `ai_answers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_answers_run_prompt_model_idx` ON `ai_answers` (`run_id`,`tracked_prompt_id`,`model`);--> statement-breakpoint
CREATE INDEX `ai_answers_prompt_observed_idx` ON `ai_answers` (`tracked_prompt_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `ai_answers_cache_key_idx` ON `ai_answers` (`cache_key`);--> statement-breakpoint
ALTER TABLE `ai_prompt_sets` ADD `last_skip_reason` text;--> statement-breakpoint
ALTER TABLE `ai_prompt_sets` ADD `last_skipped_at` text;--> statement-breakpoint
ALTER TABLE `ai_runs` ADD `reserved_answer_calls` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_runs` ADD `reservation_window_started_at` text;
