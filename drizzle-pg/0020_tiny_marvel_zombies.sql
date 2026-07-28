CREATE TABLE "recommendation_audit_issue_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"recommendation_id" text NOT NULL,
	"evidence_fingerprint" text NOT NULL,
	"audit_issue_id" text,
	"source_audit_id" text NOT NULL,
	"issue_type" text NOT NULL,
	"severity" text NOT NULL,
	"page_url" text NOT NULL,
	"details_json" text,
	"last_generated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_citation_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"recommendation_id" text NOT NULL,
	"evidence_fingerprint" text NOT NULL,
	"citation_id" integer,
	"competitor_brand_id" text,
	"evidence_role" text DEFAULT 'competitor_source' NOT NULL,
	"source_answer_id" text NOT NULL,
	"source_url" text NOT NULL,
	"source_hostname" text NOT NULL,
	"source_title" text,
	"prompt_text" text NOT NULL,
	"model" text NOT NULL,
	"observed_at" text NOT NULL,
	"competitor_brand_name" text NOT NULL,
	"last_generated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_score_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"recommendation_id" text NOT NULL,
	"factor_key" text NOT NULL,
	"label" text NOT NULL,
	"raw_value" real NOT NULL,
	"weight" real NOT NULL,
	"contribution" real NOT NULL,
	"explanation" text NOT NULL,
	"last_generated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"category" text NOT NULL,
	"rule_key" text NOT NULL,
	"generator_version" text NOT NULL,
	"fingerprint" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_url" text,
	"target_hostname" text,
	"target_label" text NOT NULL,
	"target_community" text,
	"title" text NOT NULL,
	"action" text NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority_level" text NOT NULL,
	"priority_score" integer NOT NULL,
	"score_version" text NOT NULL,
	"evidence_window_start" text,
	"evidence_window_end" text,
	"evidence_as_of" text NOT NULL,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"affected_page_count" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"answer_count" integer DEFAULT 0 NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	"target_brand_citation_count" integer DEFAULT 0 NOT NULL,
	"competitor_count" integer DEFAULT 0 NOT NULL,
	"first_observed_at" text,
	"last_observed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"last_generated_at" text NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"done_at" text,
	"declined_at" text
);
--> statement-breakpoint
ALTER TABLE "recommendation_audit_issue_evidence" ADD CONSTRAINT "recommendation_audit_issue_evidence_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_audit_issue_evidence" ADD CONSTRAINT "recommendation_audit_issue_evidence_audit_issue_id_audit_issues_id_fk" FOREIGN KEY ("audit_issue_id") REFERENCES "public"."audit_issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_citation_evidence" ADD CONSTRAINT "recommendation_citation_evidence_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_citation_evidence" ADD CONSTRAINT "recommendation_citation_evidence_citation_id_ai_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."ai_citations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_citation_evidence" ADD CONSTRAINT "recommendation_citation_evidence_competitor_brand_id_ai_brands_id_fk" FOREIGN KEY ("competitor_brand_id") REFERENCES "public"."ai_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_score_factors" ADD CONSTRAINT "recommendation_score_factors_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_audit_evidence_fingerprint_idx" ON "recommendation_audit_issue_evidence" USING btree ("recommendation_id","evidence_fingerprint");--> statement-breakpoint
CREATE INDEX "recommendation_audit_evidence_issue_idx" ON "recommendation_audit_issue_evidence" USING btree ("audit_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_citation_evidence_fingerprint_idx" ON "recommendation_citation_evidence" USING btree ("recommendation_id","evidence_fingerprint");--> statement-breakpoint
CREATE INDEX "recommendation_citation_evidence_citation_idx" ON "recommendation_citation_evidence" USING btree ("citation_id");--> statement-breakpoint
CREATE INDEX "recommendation_citation_evidence_brand_idx" ON "recommendation_citation_evidence" USING btree ("competitor_brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_score_factors_key_idx" ON "recommendation_score_factors" USING btree ("recommendation_id","factor_key");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_project_fingerprint_idx" ON "recommendations" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX "recommendations_project_status_priority_idx" ON "recommendations" USING btree ("project_id","status","is_active","priority_score");--> statement-breakpoint
CREATE INDEX "recommendations_project_category_idx" ON "recommendations" USING btree ("project_id","category");