ALTER TABLE "ai_tracked_prompts" ADD COLUMN "state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tracked_prompts" ADD COLUMN "suggestion_source" text;--> statement-breakpoint
CREATE INDEX "ai_tracked_prompts_set_state_order_idx" ON "ai_tracked_prompts" USING btree ("prompt_set_id","state","sort_order");