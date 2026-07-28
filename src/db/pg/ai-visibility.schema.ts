/* eslint-disable max-lines -- normalized AI visibility tables stay in one dialect schema for parity review. */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const timestampColumn = (name: string) => text(name);

export const aiProjectRunSettings = pgTable("ai_project_run_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  cadence: text("cadence", {
    enum: ["daily", "weekly", "monthly", "manual"],
  })
    .notNull()
    .default("weekly"),
  answerCallCap: integer("answer_call_cap").notNull().default(200),
  windowStartedAt: timestampColumn("window_started_at"),
  callsReserved: integer("calls_reserved").notNull().default(0),
  createdAt: timestampColumn("created_at").notNull().default(isoNow),
  updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
});

export const aiPromptSets = pgTable(
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
    isActive: boolean("is_active").notNull().default(true),
    lastRunAt: timestampColumn("last_run_at"),
    nextRunAt: timestampColumn("next_run_at"),
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
    lastSkippedAt: timestampColumn("last_skipped_at"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
    archivedAt: timestampColumn("archived_at"),
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

export const aiPromptSetModels = pgTable(
  "ai_prompt_set_models",
  {
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => aiPromptSets.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("ai_prompt_set_models_set_model_idx").on(
      table.promptSetId,
      table.model,
    ),
  ],
);

export const aiPromptTopics = pgTable(
  "ai_prompt_topics",
  {
    id: text("id").primaryKey(),
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => aiPromptSets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
    archivedAt: timestampColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_prompt_topics_set_name_idx").on(
      table.promptSetId,
      table.normalizedName,
    ),
  ],
);

export const aiTrackedPrompts = pgTable(
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
    state: text("state", {
      enum: ["active", "suggested", "rejected"],
    })
      .notNull()
      .default("active"),
    suggestionSource: text("suggestion_source", {
      enum: ["gsc", "topic_gap"],
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
    archivedAt: timestampColumn("archived_at"),
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
    index("ai_tracked_prompts_set_state_order_idx").on(
      table.promptSetId,
      table.state,
      table.sortOrder,
    ),
  ],
);

export const aiPromptTags = pgTable(
  "ai_prompt_tags",
  {
    id: text("id").primaryKey(),
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => aiPromptSets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
    archivedAt: timestampColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_prompt_tags_set_name_idx").on(
      table.promptSetId,
      table.normalizedName,
    ),
  ],
);

export const aiPromptTagAssignments = pgTable(
  "ai_prompt_tag_assignments",
  {
    trackedPromptId: text("tracked_prompt_id")
      .notNull()
      .references(() => aiTrackedPrompts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => aiPromptTags.id, { onDelete: "cascade" }),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("ai_prompt_tag_assignments_prompt_tag_idx").on(
      table.trackedPromptId,
      table.tagId,
    ),
    index("ai_prompt_tag_assignments_tag_idx").on(table.tagId),
  ],
);

export const aiBrands = pgTable(
  "ai_brands",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
    archivedAt: timestampColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_brands_project_name_idx").on(
      table.projectId,
      table.normalizedName,
    ),
    index("ai_brands_project_primary_idx").on(table.projectId, table.isPrimary),
  ],
);

export const aiBrandAliases = pgTable(
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
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    archivedAt: timestampColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("ai_brand_aliases_project_alias_idx").on(
      table.projectId,
      table.normalizedAlias,
    ),
    index("ai_brand_aliases_brand_idx").on(table.brandId),
  ],
);

export const aiBrandResolutionRules = pgTable(
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
      (): AnyPgColumn => aiBrandResolutionRules.id,
      { onDelete: "set null" },
    ),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    supersededAt: timestampColumn("superseded_at"),
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

export const aiBrandResolutionEvidence = pgTable(
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
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [index("ai_brand_resolution_evidence_rule_idx").on(table.ruleId)],
);

export const aiDomainClassifications = pgTable(
  "ai_domain_classifications",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    matchScope: text("match_scope", {
      enum: ["hostname", "registrable_domain"],
    }).notNull(),
    domainType: text("domain_type", {
      enum: [
        "editorial",
        "corporate",
        "ugc",
        "reference",
        "institutional",
        "other",
      ],
    }).notNull(),
    method: text("method", {
      enum: ["manual", "curated_rule", "model_suggestion"],
    }).notNull(),
    ruleVersion: text("rule_version").notNull(),
    confidence: real("confidence"),
    createdBy: text("created_by"),
    reviewedAt: timestampColumn("reviewed_at"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("ai_domain_classifications_project_domain_scope_idx").on(
      table.projectId,
      table.domain,
      table.matchScope,
    ),
    index("ai_domain_classifications_project_type_idx").on(
      table.projectId,
      table.domainType,
    ),
  ],
);

export const aiRuns = pgTable(
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
    reservationWindowStartedAt: timestampColumn(
      "reservation_window_started_at",
    ),
    providerCostUsd: real("provider_cost_usd"),
    creditsConsumed: integer("credits_consumed"),
    errorMessage: text("error_message"),
    startedAt: timestampColumn("started_at").notNull().default(isoNow),
    completedAt: timestampColumn("completed_at"),
  },
  (table) => [
    index("ai_runs_project_started_idx").on(table.projectId, table.startedAt),
    index("ai_runs_set_started_idx").on(table.promptSetId, table.startedAt),
    uniqueIndex("ai_runs_one_active_per_set_idx")
      .on(table.promptSetId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

export const aiAnswers = pgTable(
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
    sourceFetchedAt: timestampColumn("source_fetched_at"),
    observedAt: timestampColumn("observed_at").notNull().default(isoNow),
    outputTokens: integer("output_tokens"),
    webSearch: boolean("web_search"),
    fromCache: boolean("from_cache").notNull().default(false),
    billingPath: text("billing_path"),
    providerCostUsd: real("provider_cost_usd"),
    creditsConsumed: integer("credits_consumed"),
    attemptStartedAt: timestampColumn("attempt_started_at"),
    completedAt: timestampColumn("completed_at"),
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

export const aiMentionScoringAttempts = pgTable(
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
    startedAt: timestampColumn("started_at").notNull().default(isoNow),
    completedAt: timestampColumn("completed_at"),
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

export const aiBrandMentions = pgTable(
  "ai_brand_mentions",
  {
    id: serial("id").primaryKey(),
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
    scoredAt: timestampColumn("scored_at"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
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

export const aiCitations = pgTable(
  "ai_citations",
  {
    id: serial("id").primaryKey(),
    answerId: text("answer_id")
      .notNull()
      .references(() => aiAnswers.id, { onDelete: "cascade" }),
    citationOrder: integer("citation_order").notNull(),
    url: text("url").notNull(),
    domain: text("domain"),
    title: text("title"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("ai_citations_answer_url_idx").on(table.answerId, table.url),
    index("ai_citations_domain_answer_idx").on(table.domain, table.answerId),
  ],
);
