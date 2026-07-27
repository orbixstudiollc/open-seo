CREATE TABLE "ai_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"tracked_prompt_id" text NOT NULL,
	"prompt_text" text NOT NULL,
	"model" text NOT NULL,
	"model_name" text,
	"status" text NOT NULL,
	"response_text" text,
	"error_code" text,
	"error_message" text,
	"cache_key" text,
	"source_fetched_at" text,
	"observed_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"output_tokens" integer,
	"web_search" boolean,
	"provider_cost_usd" real
);
--> statement-breakpoint
CREATE TABLE "ai_brand_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"kind" text DEFAULT 'name' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_brand_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"answer_id" text NOT NULL,
	"raw_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"brand_id" text,
	"mention_count" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_brands" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"domain" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_citations" (
	"id" serial PRIMARY KEY NOT NULL,
	"answer_id" text NOT NULL,
	"citation_order" integer NOT NULL,
	"url" text NOT NULL,
	"domain" text,
	"title" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_set_models" (
	"prompt_set_id" text NOT NULL,
	"model" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" text,
	"next_run_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_tag_assignments" (
	"tracked_prompt_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_set_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_set_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_set_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger" text DEFAULT 'scheduled' NOT NULL,
	"prompts_total" integer DEFAULT 0 NOT NULL,
	"prompts_completed" integer DEFAULT 0 NOT NULL,
	"answers_expected" integer DEFAULT 0 NOT NULL,
	"answers_succeeded" integer DEFAULT 0 NOT NULL,
	"answers_failed" integer DEFAULT 0 NOT NULL,
	"provider_cost_usd" real,
	"credits_consumed" integer,
	"error_message" text,
	"started_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_tracked_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_set_id" text NOT NULL,
	"topic_id" text,
	"prompt" text NOT NULL,
	"normalized_prompt" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
ALTER TABLE "ai_answers" ADD CONSTRAINT "ai_answers_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_brand_aliases" ADD CONSTRAINT "ai_brand_aliases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_brand_aliases" ADD CONSTRAINT "ai_brand_aliases_brand_id_ai_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."ai_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD CONSTRAINT "ai_brand_mentions_answer_id_ai_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."ai_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_brand_mentions" ADD CONSTRAINT "ai_brand_mentions_brand_id_ai_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."ai_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_brands" ADD CONSTRAINT "ai_brands_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_citations" ADD CONSTRAINT "ai_citations_answer_id_ai_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."ai_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_set_models" ADD CONSTRAINT "ai_prompt_set_models_prompt_set_id_ai_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."ai_prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_sets" ADD CONSTRAINT "ai_prompt_sets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_tag_assignments" ADD CONSTRAINT "ai_prompt_tag_assignments_tracked_prompt_id_ai_tracked_prompts_id_fk" FOREIGN KEY ("tracked_prompt_id") REFERENCES "public"."ai_tracked_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_tag_assignments" ADD CONSTRAINT "ai_prompt_tag_assignments_tag_id_ai_prompt_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."ai_prompt_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_tags" ADD CONSTRAINT "ai_prompt_tags_prompt_set_id_ai_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."ai_prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_topics" ADD CONSTRAINT "ai_prompt_topics_prompt_set_id_ai_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."ai_prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_prompt_set_id_ai_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."ai_prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tracked_prompts" ADD CONSTRAINT "ai_tracked_prompts_prompt_set_id_ai_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."ai_prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tracked_prompts" ADD CONSTRAINT "ai_tracked_prompts_topic_id_ai_prompt_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."ai_prompt_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_answers_run_prompt_model_idx" ON "ai_answers" USING btree ("run_id","tracked_prompt_id","model");--> statement-breakpoint
CREATE INDEX "ai_answers_prompt_observed_idx" ON "ai_answers" USING btree ("tracked_prompt_id","observed_at");--> statement-breakpoint
CREATE INDEX "ai_answers_cache_key_idx" ON "ai_answers" USING btree ("cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_brand_aliases_project_alias_idx" ON "ai_brand_aliases" USING btree ("project_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "ai_brand_aliases_brand_idx" ON "ai_brand_aliases" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_brand_mentions_answer_name_idx" ON "ai_brand_mentions" USING btree ("answer_id","normalized_name");--> statement-breakpoint
CREATE INDEX "ai_brand_mentions_brand_answer_idx" ON "ai_brand_mentions" USING btree ("brand_id","answer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_brands_project_name_idx" ON "ai_brands" USING btree ("project_id","normalized_name");--> statement-breakpoint
CREATE INDEX "ai_brands_project_primary_idx" ON "ai_brands" USING btree ("project_id","is_primary");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_citations_answer_url_idx" ON "ai_citations" USING btree ("answer_id","url");--> statement-breakpoint
CREATE INDEX "ai_citations_domain_answer_idx" ON "ai_citations" USING btree ("domain","answer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_set_models_set_model_idx" ON "ai_prompt_set_models" USING btree ("prompt_set_id","model");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_sets_project_name_idx" ON "ai_prompt_sets" USING btree ("project_id","normalized_name");--> statement-breakpoint
CREATE INDEX "ai_prompt_sets_project_active_next_idx" ON "ai_prompt_sets" USING btree ("project_id","is_active","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_tag_assignments_prompt_tag_idx" ON "ai_prompt_tag_assignments" USING btree ("tracked_prompt_id","tag_id");--> statement-breakpoint
CREATE INDEX "ai_prompt_tag_assignments_tag_idx" ON "ai_prompt_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_tags_set_name_idx" ON "ai_prompt_tags" USING btree ("prompt_set_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_topics_set_name_idx" ON "ai_prompt_topics" USING btree ("prompt_set_id","normalized_name");--> statement-breakpoint
CREATE INDEX "ai_runs_project_started_idx" ON "ai_runs" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_runs_set_started_idx" ON "ai_runs" USING btree ("prompt_set_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_one_active_per_set_idx" ON "ai_runs" USING btree ("prompt_set_id") WHERE "ai_runs"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tracked_prompts_set_prompt_idx" ON "ai_tracked_prompts" USING btree ("prompt_set_id","normalized_prompt");--> statement-breakpoint
CREATE INDEX "ai_tracked_prompts_set_topic_order_idx" ON "ai_tracked_prompts" USING btree ("prompt_set_id","topic_id","sort_order");