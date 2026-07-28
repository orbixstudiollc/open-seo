import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { aiBrands, aiCitations } from "./ai-visibility.schema";
import { projects } from "./app.schema";
import { auditIssues } from "./audit.schema";

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["off_page", "on_page", "technical"],
    }).notNull(),
    ruleKey: text("rule_key").notNull(),
    generatorVersion: text("generator_version").notNull(),
    fingerprint: text("fingerprint").notNull(),
    targetKind: text("target_kind", {
      enum: ["site_page", "external_url", "domain", "community"],
    }).notNull(),
    targetUrl: text("target_url"),
    targetHostname: text("target_hostname"),
    targetLabel: text("target_label").notNull(),
    targetCommunity: text("target_community"),
    title: text("title").notNull(),
    action: text("action").notNull(),
    rationale: text("rationale").notNull(),
    status: text("status", { enum: ["todo", "done", "declined"] })
      .notNull()
      .default("todo"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    priorityLevel: text("priority_level", {
      enum: ["high", "medium", "low"],
    }).notNull(),
    priorityScore: integer("priority_score").notNull(),
    scoreVersion: text("score_version").notNull(),
    evidenceWindowStart: text("evidence_window_start"),
    evidenceWindowEnd: text("evidence_window_end"),
    evidenceAsOf: text("evidence_as_of").notNull(),
    occurrenceCount: integer("occurrence_count").notNull().default(0),
    affectedPageCount: integer("affected_page_count").notNull().default(0),
    citationCount: integer("citation_count").notNull().default(0),
    answerCount: integer("answer_count").notNull().default(0),
    promptCount: integer("prompt_count").notNull().default(0),
    targetBrandCitationCount: integer("target_brand_citation_count")
      .notNull()
      .default(0),
    competitorCount: integer("competitor_count").notNull().default(0),
    firstObservedAt: text("first_observed_at"),
    lastObservedAt: text("last_observed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    lastGeneratedAt: text("last_generated_at").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    doneAt: text("done_at"),
    declinedAt: text("declined_at"),
  },
  (table) => [
    uniqueIndex("recommendations_project_fingerprint_idx").on(
      table.projectId,
      table.fingerprint,
    ),
    index("recommendations_project_status_priority_idx").on(
      table.projectId,
      table.status,
      table.isActive,
      table.priorityScore,
    ),
    index("recommendations_project_category_idx").on(
      table.projectId,
      table.category,
    ),
  ],
);

export const recommendationAuditIssueEvidence = sqliteTable(
  "recommendation_audit_issue_evidence",
  {
    id: text("id").primaryKey(),
    recommendationId: text("recommendation_id")
      .notNull()
      .references(() => recommendations.id, { onDelete: "cascade" }),
    evidenceFingerprint: text("evidence_fingerprint").notNull(),
    auditIssueId: text("audit_issue_id").references(() => auditIssues.id, {
      onDelete: "set null",
    }),
    sourceAuditId: text("source_audit_id").notNull(),
    issueType: text("issue_type").notNull(),
    severity: text("severity", {
      enum: ["critical", "warning", "info"],
    }).notNull(),
    pageUrl: text("page_url").notNull(),
    detailsJson: text("details_json"),
    lastGeneratedAt: text("last_generated_at").notNull(),
  },
  (table) => [
    uniqueIndex("recommendation_audit_evidence_fingerprint_idx").on(
      table.recommendationId,
      table.evidenceFingerprint,
    ),
    index("recommendation_audit_evidence_issue_idx").on(table.auditIssueId),
  ],
);

export const recommendationCitationEvidence = sqliteTable(
  "recommendation_citation_evidence",
  {
    id: text("id").primaryKey(),
    recommendationId: text("recommendation_id")
      .notNull()
      .references(() => recommendations.id, { onDelete: "cascade" }),
    evidenceFingerprint: text("evidence_fingerprint").notNull(),
    citationId: integer("citation_id").references(() => aiCitations.id, {
      onDelete: "set null",
    }),
    competitorBrandId: text("competitor_brand_id").references(
      () => aiBrands.id,
      { onDelete: "set null" },
    ),
    evidenceRole: text("evidence_role", {
      enum: ["competitor_source"],
    })
      .notNull()
      .default("competitor_source"),
    sourceAnswerId: text("source_answer_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceHostname: text("source_hostname").notNull(),
    sourceTitle: text("source_title"),
    promptText: text("prompt_text").notNull(),
    model: text("model").notNull(),
    observedAt: text("observed_at").notNull(),
    competitorBrandName: text("competitor_brand_name").notNull(),
    lastGeneratedAt: text("last_generated_at").notNull(),
  },
  (table) => [
    uniqueIndex("recommendation_citation_evidence_fingerprint_idx").on(
      table.recommendationId,
      table.evidenceFingerprint,
    ),
    index("recommendation_citation_evidence_citation_idx").on(table.citationId),
    index("recommendation_citation_evidence_brand_idx").on(
      table.competitorBrandId,
    ),
  ],
);

export const recommendationScoreFactors = sqliteTable(
  "recommendation_score_factors",
  {
    id: text("id").primaryKey(),
    recommendationId: text("recommendation_id")
      .notNull()
      .references(() => recommendations.id, { onDelete: "cascade" }),
    factorKey: text("factor_key").notNull(),
    label: text("label").notNull(),
    rawValue: real("raw_value").notNull(),
    weight: real("weight").notNull(),
    contribution: real("contribution").notNull(),
    explanation: text("explanation").notNull(),
    lastGeneratedAt: text("last_generated_at").notNull(),
  },
  (table) => [
    uniqueIndex("recommendation_score_factors_key_idx").on(
      table.recommendationId,
      table.factorKey,
    ),
  ],
);
