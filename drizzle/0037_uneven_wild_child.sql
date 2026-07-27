CREATE TABLE `ai_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tracked_prompt_id` text NOT NULL,
	`prompt_text` text NOT NULL,
	`model` text NOT NULL,
	`model_name` text,
	`status` text NOT NULL,
	`response_text` text,
	`error_code` text,
	`error_message` text,
	`cache_key` text,
	`source_fetched_at` text,
	`observed_at` text DEFAULT (current_timestamp) NOT NULL,
	`output_tokens` integer,
	`web_search` integer,
	`provider_cost_usd` real,
	FOREIGN KEY (`run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_answers_run_prompt_model_idx` ON `ai_answers` (`run_id`,`tracked_prompt_id`,`model`);--> statement-breakpoint
CREATE INDEX `ai_answers_prompt_observed_idx` ON `ai_answers` (`tracked_prompt_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `ai_answers_cache_key_idx` ON `ai_answers` (`cache_key`);--> statement-breakpoint
CREATE TABLE `ai_brand_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`alias` text NOT NULL,
	`normalized_alias` text NOT NULL,
	`kind` text DEFAULT 'name' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brand_id`) REFERENCES `ai_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_brand_aliases_project_alias_idx` ON `ai_brand_aliases` (`project_id`,`normalized_alias`);--> statement-breakpoint
CREATE INDEX `ai_brand_aliases_brand_idx` ON `ai_brand_aliases` (`brand_id`);--> statement-breakpoint
CREATE TABLE `ai_brand_mentions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`answer_id` text NOT NULL,
	`raw_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`brand_id` text,
	`mention_count` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`answer_id`) REFERENCES `ai_answers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brand_id`) REFERENCES `ai_brands`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_brand_mentions_answer_name_idx` ON `ai_brand_mentions` (`answer_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `ai_brand_mentions_brand_answer_idx` ON `ai_brand_mentions` (`brand_id`,`answer_id`);--> statement-breakpoint
CREATE TABLE `ai_brands` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`domain` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_brands_project_name_idx` ON `ai_brands` (`project_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `ai_brands_project_primary_idx` ON `ai_brands` (`project_id`,`is_primary`);--> statement-breakpoint
CREATE TABLE `ai_citations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`answer_id` text NOT NULL,
	`citation_order` integer NOT NULL,
	`url` text NOT NULL,
	`domain` text,
	`title` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`answer_id`) REFERENCES `ai_answers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_citations_answer_url_idx` ON `ai_citations` (`answer_id`,`url`);--> statement-breakpoint
CREATE INDEX `ai_citations_domain_answer_idx` ON `ai_citations` (`domain`,`answer_id`);--> statement-breakpoint
CREATE TABLE `ai_prompt_set_models` (
	`prompt_set_id` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`prompt_set_id`) REFERENCES `ai_prompt_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_prompt_set_models_set_model_idx` ON `ai_prompt_set_models` (`prompt_set_id`,`model`);--> statement-breakpoint
CREATE TABLE `ai_prompt_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_prompt_sets_project_name_idx` ON `ai_prompt_sets` (`project_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `ai_prompt_sets_project_active_next_idx` ON `ai_prompt_sets` (`project_id`,`is_active`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `ai_prompt_tag_assignments` (
	`tracked_prompt_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`tracked_prompt_id`) REFERENCES `ai_tracked_prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `ai_prompt_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_prompt_tag_assignments_prompt_tag_idx` ON `ai_prompt_tag_assignments` (`tracked_prompt_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `ai_prompt_tag_assignments_tag_idx` ON `ai_prompt_tag_assignments` (`tag_id`);--> statement-breakpoint
CREATE TABLE `ai_prompt_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_set_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`prompt_set_id`) REFERENCES `ai_prompt_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_prompt_tags_set_name_idx` ON `ai_prompt_tags` (`prompt_set_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `ai_prompt_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_set_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`prompt_set_id`) REFERENCES `ai_prompt_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_prompt_topics_set_name_idx` ON `ai_prompt_topics` (`prompt_set_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_set_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`trigger` text DEFAULT 'scheduled' NOT NULL,
	`prompts_total` integer DEFAULT 0 NOT NULL,
	`prompts_completed` integer DEFAULT 0 NOT NULL,
	`answers_expected` integer DEFAULT 0 NOT NULL,
	`answers_succeeded` integer DEFAULT 0 NOT NULL,
	`answers_failed` integer DEFAULT 0 NOT NULL,
	`provider_cost_usd` real,
	`credits_consumed` integer,
	`error_message` text,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`prompt_set_id`) REFERENCES `ai_prompt_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_runs_project_started_idx` ON `ai_runs` (`project_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `ai_runs_set_started_idx` ON `ai_runs` (`prompt_set_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runs_one_active_per_set_idx` ON `ai_runs` (`prompt_set_id`) WHERE "ai_runs"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE TABLE `ai_tracked_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_set_id` text NOT NULL,
	`topic_id` text,
	`prompt` text NOT NULL,
	`normalized_prompt` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`prompt_set_id`) REFERENCES `ai_prompt_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `ai_prompt_topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_tracked_prompts_set_prompt_idx` ON `ai_tracked_prompts` (`prompt_set_id`,`normalized_prompt`);--> statement-breakpoint
CREATE INDEX `ai_tracked_prompts_set_topic_order_idx` ON `ai_tracked_prompts` (`prompt_set_id`,`topic_id`,`sort_order`);