CREATE TABLE `recommendation_audit_issue_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`evidence_fingerprint` text NOT NULL,
	`audit_issue_id` text,
	`source_audit_id` text NOT NULL,
	`issue_type` text NOT NULL,
	`severity` text NOT NULL,
	`page_url` text NOT NULL,
	`details_json` text,
	`last_generated_at` text NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`audit_issue_id`) REFERENCES `audit_issues`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_audit_evidence_fingerprint_idx` ON `recommendation_audit_issue_evidence` (`recommendation_id`,`evidence_fingerprint`);--> statement-breakpoint
CREATE INDEX `recommendation_audit_evidence_issue_idx` ON `recommendation_audit_issue_evidence` (`audit_issue_id`);--> statement-breakpoint
CREATE TABLE `recommendation_citation_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`evidence_fingerprint` text NOT NULL,
	`citation_id` integer,
	`competitor_brand_id` text,
	`evidence_role` text DEFAULT 'competitor_source' NOT NULL,
	`source_answer_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_hostname` text NOT NULL,
	`source_title` text,
	`prompt_text` text NOT NULL,
	`model` text NOT NULL,
	`observed_at` text NOT NULL,
	`competitor_brand_name` text NOT NULL,
	`last_generated_at` text NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`citation_id`) REFERENCES `ai_citations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`competitor_brand_id`) REFERENCES `ai_brands`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_citation_evidence_fingerprint_idx` ON `recommendation_citation_evidence` (`recommendation_id`,`evidence_fingerprint`);--> statement-breakpoint
CREATE INDEX `recommendation_citation_evidence_citation_idx` ON `recommendation_citation_evidence` (`citation_id`);--> statement-breakpoint
CREATE INDEX `recommendation_citation_evidence_brand_idx` ON `recommendation_citation_evidence` (`competitor_brand_id`);--> statement-breakpoint
CREATE TABLE `recommendation_score_factors` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`factor_key` text NOT NULL,
	`label` text NOT NULL,
	`raw_value` real NOT NULL,
	`weight` real NOT NULL,
	`contribution` real NOT NULL,
	`explanation` text NOT NULL,
	`last_generated_at` text NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_score_factors_key_idx` ON `recommendation_score_factors` (`recommendation_id`,`factor_key`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`rule_key` text NOT NULL,
	`generator_version` text NOT NULL,
	`fingerprint` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_url` text,
	`target_hostname` text,
	`target_label` text NOT NULL,
	`target_community` text,
	`title` text NOT NULL,
	`action` text NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`priority_level` text NOT NULL,
	`priority_score` integer NOT NULL,
	`score_version` text NOT NULL,
	`evidence_window_start` text,
	`evidence_window_end` text,
	`evidence_as_of` text NOT NULL,
	`occurrence_count` integer DEFAULT 0 NOT NULL,
	`affected_page_count` integer DEFAULT 0 NOT NULL,
	`citation_count` integer DEFAULT 0 NOT NULL,
	`answer_count` integer DEFAULT 0 NOT NULL,
	`prompt_count` integer DEFAULT 0 NOT NULL,
	`target_brand_citation_count` integer DEFAULT 0 NOT NULL,
	`competitor_count` integer DEFAULT 0 NOT NULL,
	`first_observed_at` text,
	`last_observed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`last_generated_at` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`done_at` text,
	`declined_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendations_project_fingerprint_idx` ON `recommendations` (`project_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `recommendations_project_status_priority_idx` ON `recommendations` (`project_id`,`status`,`is_active`,`priority_score`);--> statement-breakpoint
CREATE INDEX `recommendations_project_category_idx` ON `recommendations` (`project_id`,`category`);