CREATE TABLE "ai_domain_classifications" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"domain" text NOT NULL,
	"match_scope" text NOT NULL,
	"domain_type" text NOT NULL,
	"method" text NOT NULL,
	"rule_version" text NOT NULL,
	"confidence" real,
	"created_by" text,
	"reviewed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_domain_classifications" ADD CONSTRAINT "ai_domain_classifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_domain_classifications_project_domain_scope_idx" ON "ai_domain_classifications" USING btree ("project_id","domain","match_scope");--> statement-breakpoint
CREATE INDEX "ai_domain_classifications_project_type_idx" ON "ai_domain_classifications" USING btree ("project_id","domain_type");