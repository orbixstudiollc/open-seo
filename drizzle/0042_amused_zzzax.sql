CREATE TABLE `report_digest_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`window_days` integer DEFAULT 30 NOT NULL,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`next_send_at` text,
	`last_sent_at` text,
	`last_error` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_digest_schedules_project_user_idx` ON `report_digest_schedules` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `report_digest_schedules_due_idx` ON `report_digest_schedules` (`enabled`,`next_send_at`);--> statement-breakpoint
CREATE TABLE `report_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`token_digest` text NOT NULL,
	`report_version` integer DEFAULT 1 NOT NULL,
	`window_days` integer NOT NULL,
	`purpose` text DEFAULT 'manual' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_shares_token_digest_idx` ON `report_shares` (`token_digest`);--> statement-breakpoint
CREATE INDEX `report_shares_project_created_idx` ON `report_shares` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_shares_expires_idx` ON `report_shares` (`expires_at`);