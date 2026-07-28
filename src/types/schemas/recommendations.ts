import { z } from "zod";

export const recommendationCategorySchema = z.enum([
  "off_page",
  "on_page",
  "technical",
]);
export const recommendationStatusSchema = z.enum(["todo", "done", "declined"]);
export const recommendationPriorityLevelSchema = z.enum([
  "high",
  "medium",
  "low",
]);

export const recommendationProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const updateRecommendationStatusInputSchema = z.object({
  projectId: z.string().min(1),
  recommendationId: z.string().min(1),
  status: recommendationStatusSchema,
});

export type RecommendationCategory = z.infer<
  typeof recommendationCategorySchema
>;
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>;
export type RecommendationPriorityLevel = z.infer<
  typeof recommendationPriorityLevelSchema
>;

export type RecommendationScoreFactor = {
  factorKey: string;
  label: string;
  rawValue: number;
  weight: number;
  contribution: number;
  explanation: string;
};

export type RecommendationAuditEvidence = {
  id: string;
  auditIssueId: string | null;
  sourceAuditId: string;
  issueType: string;
  severity: "critical" | "warning" | "info";
  pageUrl: string;
  detailsJson: string | null;
};

export type RecommendationCitationEvidence = {
  id: string;
  citationId: number | null;
  competitorBrandId: string | null;
  sourceAnswerId: string;
  sourceUrl: string;
  sourceHostname: string;
  sourceTitle: string | null;
  promptText: string;
  model: string;
  observedAt: string;
  competitorBrandName: string;
};

export type RecommendationItem = {
  id: string;
  category: RecommendationCategory;
  ruleKey: string;
  generatorVersion: string;
  targetKind: "site_page" | "external_url" | "domain" | "community";
  targetUrl: string | null;
  targetHostname: string | null;
  targetLabel: string;
  targetCommunity: string | null;
  title: string;
  action: string;
  rationale: string;
  status: RecommendationStatus;
  isActive: boolean;
  priorityLevel: RecommendationPriorityLevel;
  priorityScore: number;
  scoreVersion: string;
  evidenceWindowStart: string | null;
  evidenceWindowEnd: string | null;
  evidenceAsOf: string;
  occurrenceCount: number;
  affectedPageCount: number;
  citationCount: number;
  answerCount: number;
  promptCount: number;
  targetBrandCitationCount: number;
  competitorCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  createdAt: string;
  lastGeneratedAt: string;
  updatedAt: string;
  doneAt: string | null;
  declinedAt: string | null;
  scoreFactors: RecommendationScoreFactor[];
  auditEvidence: RecommendationAuditEvidence[];
  citationEvidence: RecommendationCitationEvidence[];
};

export type RecommendationQueue = {
  generatedAt: string | null;
  items: RecommendationItem[];
};
