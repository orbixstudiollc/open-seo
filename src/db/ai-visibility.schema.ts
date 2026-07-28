/* eslint-disable max-lines -- normalized AI visibility tables stay in one dialect schema for parity review. */
import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

export const aiProjectRunSettings = sqliteTable("ai_project_run_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  cadence: text("cadence", {
    enum: ["daily", "weekly", "monthly", "manual"],
  })
    .notNull()
    .default("weekly"),
  answerCallCap: integer("answer_call_cap").notNull().default(200),
  windowStartedAt: text("window_started_at"),
  callsReserved: integer("calls_reserved").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const aiPromptSets = sqliteTable(
  "ai_prompt_sets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    cadence: text("cadence", {
      enum: ["daily", "weekly", "monthly", "manual"],
    })
      .notNull()
      .default("weekly"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastRunAt: text("last_run_at"),
    nextRunAt: text("next_run_at"),
    lastSkipReason: text("last_skip_reason", {
      enum: [
        "run_cap_reached",
        "no_prompts",
        "payment_required",
        "already_running",
        "archived",
        "workflow_start_failed",
      ],
    }),
    lastSkippedAt: text("last_skipped_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_prompt_sets_project_name_idx").on(
      table.projectId,
      table.normalizedName,
    ),
    index("ai_prompt_sets_project_active_next_idx").on(
      table.projectId,
      table.isActive,
      table.nextRunAt,
    ),
  ],
);

export const aiPromptSetModels = sqliteTable(
  "ai_prompt_set_models",
  {
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => aiPromptSets.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("ai_prompt_set_models_set_model_idx").on(
      table.promptSetId,
      table.model,
    ),
  ],
);

export const aiPromptTopics = sqliteTable(
  "ai_prompt_topics",
  {
    id: text("id").primaryKey(),
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => aiPromptSets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_prompt_topics_set_name_idx").on(
      table.promptSetId,
      table.normalizedName,
    ),
  ],
);

export const aiTrackedPrompts = sqliteTable(
  "ai_tracked_prompts",
  {
    id: text("id").primaryKey(),
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => aiPromptSets.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => aiPromptTopics.id, {
      onDelete: "set null",
    }),
    prompt: text("prompt").notNull(),
    normalizedPrompt: text("normalized_prompt").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_tracked_prompts_set_prompt_idx").on(
      table.promptSetId,
      table.normalizedPrompt,
    ),
    index("ai_tracked_prompts_set_topic_order_idx").on(
      table.promptSetId,
      table.topicId,
      table.sortOrder,
    ),
  ],
);

export const aiPromptTags = sqliteTable(
  "ai_prompt_tags",
  {
    id: text("id").primaryKey(),
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => aiPromptSets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_prompt_tags_set_name_idx").on(
      table.promptSetId,
      table.normalizedName,
    ),
  ],
);

export const aiPromptTagAssignments = sqliteTable(
  "ai_prompt_tag_assignments",
  {
    trackedPromptId: text("tracked_prompt_id")
      .notNull()
      .references(() => aiTrackedPrompts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => aiPromptTags.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("ai_prompt_tag_assignments_prompt_tag_idx").on(
      table.trackedPromptId,
      table.tagId,
    ),
    index("ai_prompt_tag_assignments_tag_idx").on(table.tagId),
  ],
);

export const aiBrands = sqliteTable(
  "ai_brands",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain"),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_brands_project_name_idx").on(
      table.projectId,
      table.normalizedName,
    ),
    index("ai_brands_project_primary_idx").on(table.projectId, table.isPrimary),
  ],
);

export const aiBrandAliases = sqliteTable(
  "ai_brand_aliases",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    brandId: text("brand_id")
      .notNull()
      .references(() => aiBrands.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    kind: text("kind", { enum: ["name", "domain"] })
      .notNull()
      .default("name"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_brand_aliases_project_alias_idx").on(
      table.projectId,
      table.normalizedAlias,
    ),
    index("ai_brand_aliases_brand_idx").on(table.brandId),
  ],
);

export const aiBrandResolutionRules = sqliteTable(
  "ai_brand_resolution_rules",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    normalizedName: text("normalized_name").notNull(),
    state: text("state", {
      enum: ["resolved", "suppressed", "needs_review", "unresolved"],
    }).notNull(),
    brandId: text("brand_id").references(() => aiBrands.id, {
      onDelete: "set null",
    }),
    source: text("source", {
      enum: ["manual", "registry", "generic", "ambiguous", "unresolved"],
    }).notNull(),
    ruleVersion: text("rule_version").notNull(),
    confidence: real("confidence").notNull(),
    createdBy: text("created_by"),
    reason: text("reason"),
    supersedesRuleId: text("supersedes_rule_id").references(
      (): AnySQLiteColumn => aiBrandResolutionRules.id,
      { onDelete: "set null" },
    ),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    supersededAt: text("superseded_at"),
  },
  (table) => [
    uniqueIndex("ai_brand_resolution_rules_active_name_idx")
      .on(table.projectId, table.normalizedName)
      .where(sql`${table.supersededAt} IS NULL`),
    index("ai_brand_resolution_rules_project_state_idx").on(
      table.projectId,
      table.state,
    ),
    index("ai_brand_resolution_rules_brand_idx").on(table.brandId),
  ],
);

export const aiBrandResolutionEvidence = sqliteTable(
  "ai_brand_resolution_evidence",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => aiBrandResolutionRules.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "primary_domain",
        "verified_alias",
        "canonical_name",
        "generic_taxonomy",
        "conflicting_signal",
        "clustering_signal",
        "manual_reason",
      ],
    }).notNull(),
    value: text("value").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("ai_brand_resolution_evidence_rule_idx").on(table.ruleId)],
);

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => aiPromptSets.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "completed", "partial", "failed"],
    })
      .notNull()
      .default("pending"),
    trigger: text("trigger", { enum: ["scheduled", "manual"] })
      .notNull()
      .default("scheduled"),
    promptsTotal: integer("prompts_total").notNull().default(0),
    promptsCompleted: integer("prompts_completed").notNull().default(0),
    answersExpected: integer("answers_expected").notNull().default(0),
    answersSucceeded: integer("answers_succeeded").notNull().default(0),
    answersFailed: integer("answers_failed").notNull().default(0),
    reservedAnswerCalls: integer("reserved_answer_calls").notNull().default(0),
    reservationWindowStartedAt: text("reservation_window_started_at"),
    providerCostUsd: real("provider_cost_usd"),
    creditsConsumed: integer("credits_consumed"),
    errorMessage: text("error_message"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("ai_runs_project_started_idx").on(table.projectId, table.startedAt),
    index("ai_runs_set_started_idx").on(table.promptSetId, table.startedAt),
    uniqueIndex("ai_runs_one_active_per_set_idx")
      .on(table.promptSetId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

export const aiAnswers = sqliteTable(
  "ai_answers",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    // Intentionally no FK: prompt history survives prompt archival/removal.
    trackedPromptId: text("tracked_prompt_id").notNull(),
    promptText: text("prompt_text").notNull(),
    model: text("model").notNull(),
    modelName: text("model_name"),
    status: text("status", {
      enum: ["pending", "running", "success", "error"],
    })
      .notNull()
      .default("pending"),
    responseText: text("response_text"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    cacheKey: text("cache_key"),
    sourceFetchedAt: text("source_fetched_at"),
    observedAt: text("observed_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    outputTokens: integer("output_tokens"),
    webSearch: integer("web_search", { mode: "boolean" }),
    fromCache: integer("from_cache", { mode: "boolean" })
      .notNull()
      .default(false),
    billingPath: text("billing_path"),
    providerCostUsd: real("provider_cost_usd"),
    creditsConsumed: integer("credits_consumed"),
    attemptStartedAt: text("attempt_started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("ai_answers_run_prompt_model_idx").on(
      table.runId,
      table.trackedPromptId,
      table.model,
    ),
    index("ai_answers_prompt_observed_idx").on(
      table.trackedPromptId,
      table.observedAt,
    ),
    index("ai_answers_cache_key_idx").on(table.cacheKey),
  ],
);

export const aiMentionScoringAttempts = sqliteTable(
  "ai_mention_scoring_attempts",
  {
    id: text("id").primaryKey(),
    answerId: text("answer_id")
      .notNull()
      .references(() => aiAnswers.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    providerKind: text("provider_kind", {
      enum: ["openrouter", "custom"],
    }).notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status", {
      enum: ["running", "success", "failed", "skipped"],
    })
      .notNull()
      .default("running"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: real("cost_usd"),
    costBasis: text("cost_basis", {
      enum: ["actual", "estimated", "unknown"],
    })
      .notNull()
      .default("unknown"),
    inputUsdPerMillion: real("input_usd_per_million"),
    outputUsdPerMillion: real("output_usd_per_million"),
    errorCode: text("error_code"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("ai_mention_scoring_attempts_answer_version_idx").on(
      table.answerId,
      table.promptVersion,
    ),
    index("ai_mention_scoring_attempts_run_started_idx").on(
      table.runId,
      table.startedAt,
    ),
  ],
);

export const aiBrandMentions = sqliteTable(
  "ai_brand_mentions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    answerId: text("answer_id")
      .notNull()
      .references(() => aiAnswers.id, { onDelete: "cascade" }),
    rawName: text("raw_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    brandId: text("brand_id").references(() => aiBrands.id, {
      onDelete: "set null",
    }),
    mentionCount: integer("mention_count").notNull().default(1),
    sentiment: text("sentiment", {
      enum: ["positive", "neutral", "negative"],
    }),
    position: integer("position"),
    firstOccurrenceStart: integer("first_occurrence_start"),
    firstOccurrenceEnd: integer("first_occurrence_end"),
    scoringStatus: text("scoring_status", {
      enum: ["pending", "scored", "failed", "skipped"],
    })
      .notNull()
      .default("pending"),
    scoringAttemptId: text("scoring_attempt_id").references(
      () => aiMentionScoringAttempts.id,
      { onDelete: "set null" },
    ),
    scoredAt: text("scored_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("ai_brand_mentions_answer_name_idx").on(
      table.answerId,
      table.normalizedName,
    ),
    index("ai_brand_mentions_brand_answer_idx").on(
      table.brandId,
      table.answerId,
    ),
  ],
);

export const aiCitations = sqliteTable(
  "ai_citations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    answerId: text("answer_id")
      .notNull()
      .references(() => aiAnswers.id, { onDelete: "cascade" }),
    citationOrder: integer("citation_order").notNull(),
    url: text("url").notNull(),
    domain: text("domain"),
    title: text("title"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("ai_citations_answer_url_idx").on(table.answerId, table.url),
    index("ai_citations_domain_answer_idx").on(table.domain, table.answerId),
  ],
);
