CREATE TABLE "ai_mention_scoring_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"answer_id" text NOT NULL,
	"run_id" text NOT NULL,
	"provider_kind" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" real,
	"cost_basis" text DEFAULT 'unknown' NOT NULL,
	"input_usd_per_million" real,
	"output_usd_per_million" real,
	"error_code" text,
	"started_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD COLUMN "sentiment" text;--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD COLUMN "first_occurrence_start" integer;--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD COLUMN "first_occurrence_end" integer;--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD COLUMN "scoring_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD COLUMN "scoring_attempt_id" text;--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD COLUMN "scored_at" text;--> statement-breakpoint
ALTER TABLE "ai_mention_scoring_attempts" ADD CONSTRAINT "ai_mention_scoring_attempts_answer_id_ai_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."ai_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_mention_scoring_attempts" ADD CONSTRAINT "ai_mention_scoring_attempts_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_mention_scoring_attempts_answer_version_idx" ON "ai_mention_scoring_attempts" USING btree ("answer_id","prompt_version");--> statement-breakpoint
CREATE INDEX "ai_mention_scoring_attempts_run_started_idx" ON "ai_mention_scoring_attempts" USING btree ("run_id","started_at");--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD CONSTRAINT "ai_brand_mentions_scoring_attempt_id_ai_mention_scoring_attempts_id_fk" FOREIGN KEY ("scoring_attempt_id") REFERENCES "public"."ai_mention_scoring_attempts"("id") ON DELETE set null ON UPDATE no action;