CREATE TABLE "ai_brand_resolution_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_brand_resolution_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"normalized_name" text NOT NULL,
	"state" text NOT NULL,
	"brand_id" text,
	"source" text NOT NULL,
	"rule_version" text NOT NULL,
	"confidence" real NOT NULL,
	"created_by" text,
	"reason" text,
	"supersedes_rule_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"superseded_at" text
);
--> statement-breakpoint
ALTER TABLE "ai_brand_resolution_evidence" ADD CONSTRAINT "ai_brand_resolution_evidence_rule_id_ai_brand_resolution_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."ai_brand_resolution_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_brand_resolution_rules" ADD CONSTRAINT "ai_brand_resolution_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_brand_resolution_rules" ADD CONSTRAINT "ai_brand_resolution_rules_brand_id_ai_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."ai_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_brand_resolution_rules" ADD CONSTRAINT "ai_brand_resolution_rules_supersedes_rule_id_ai_brand_resolution_rules_id_fk" FOREIGN KEY ("supersedes_rule_id") REFERENCES "public"."ai_brand_resolution_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_brand_resolution_evidence_rule_idx" ON "ai_brand_resolution_evidence" USING btree ("rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_brand_resolution_rules_active_name_idx" ON "ai_brand_resolution_rules" USING btree ("project_id","normalized_name") WHERE "ai_brand_resolution_rules"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ai_brand_resolution_rules_project_state_idx" ON "ai_brand_resolution_rules" USING btree ("project_id","state");--> statement-breakpoint
CREATE INDEX "ai_brand_resolution_rules_brand_idx" ON "ai_brand_resolution_rules" USING btree ("brand_id");