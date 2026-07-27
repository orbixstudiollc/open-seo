CREATE TABLE "ai_project_run_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"answer_call_cap" integer DEFAULT 200 NOT NULL,
	"window_started_at" text,
	"calls_reserved" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_answers" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "ai_answers" ADD COLUMN "from_cache" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_answers" ADD COLUMN "billing_path" text;--> statement-breakpoint
ALTER TABLE "ai_answers" ADD COLUMN "credits_consumed" integer;--> statement-breakpoint
ALTER TABLE "ai_answers" ADD COLUMN "attempt_started_at" text;--> statement-breakpoint
ALTER TABLE "ai_answers" ADD COLUMN "completed_at" text;--> statement-breakpoint
ALTER TABLE "ai_prompt_sets" ADD COLUMN "last_skip_reason" text;--> statement-breakpoint
ALTER TABLE "ai_prompt_sets" ADD COLUMN "last_skipped_at" text;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "reserved_answer_calls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "reservation_window_started_at" text;--> statement-breakpoint
ALTER TABLE "ai_project_run_settings" ADD CONSTRAINT "ai_project_run_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;