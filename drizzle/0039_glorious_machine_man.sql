CREATE TABLE `ai_brand_resolution_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `ai_brand_resolution_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_brand_resolution_evidence_rule_idx` ON `ai_brand_resolution_evidence` (`rule_id`);--> statement-breakpoint
CREATE TABLE `ai_brand_resolution_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`normalized_name` text NOT NULL,
	`state` text NOT NULL,
	`brand_id` text,
	`source` text NOT NULL,
	`rule_version` text NOT NULL,
	`confidence` real NOT NULL,
	`created_by` text,
	`reason` text,
	`supersedes_rule_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`superseded_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brand_id`) REFERENCES `ai_brands`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supersedes_rule_id`) REFERENCES `ai_brand_resolution_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_brand_resolution_rules_active_name_idx` ON `ai_brand_resolution_rules` (`project_id`,`normalized_name`) WHERE "ai_brand_resolution_rules"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX `ai_brand_resolution_rules_project_state_idx` ON `ai_brand_resolution_rules` (`project_id`,`state`);--> statement-breakpoint
CREATE INDEX `ai_brand_resolution_rules_brand_idx` ON `ai_brand_resolution_rules` (`brand_id`);