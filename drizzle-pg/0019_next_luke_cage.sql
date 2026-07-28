CREATE TABLE "report_digest_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"window_days" integer DEFAULT 30 NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"next_send_at" text,
	"last_sent_at" text,
	"last_error" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"token_digest" text NOT NULL,
	"report_version" integer DEFAULT 1 NOT NULL,
	"window_days" integer NOT NULL,
	"purpose" text DEFAULT 'manual' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"expires_at" text NOT NULL,
	"revoked_at" text
);
--> statement-breakpoint
ALTER TABLE "report_digest_schedules" ADD CONSTRAINT "report_digest_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_digest_schedules" ADD CONSTRAINT "report_digest_schedules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_digest_schedules" ADD CONSTRAINT "report_digest_schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_digest_schedules_project_user_idx" ON "report_digest_schedules" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "report_digest_schedules_due_idx" ON "report_digest_schedules" USING btree ("enabled","next_send_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_shares_token_digest_idx" ON "report_shares" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "report_shares_project_created_idx" ON "report_shares" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "report_shares_expires_idx" ON "report_shares" USING btree ("expires_at");