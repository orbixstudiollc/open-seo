import { z } from "zod";
import { visibilityWindowSchema } from "./ai-visibility-analytics";

export const REPORT_CONTRACT_VERSION = 1 as const;

const nullableMetricSchema = z.number().nullable();

const reportVisibilityBreakdownSchema = z.object({
  label: z.string(),
  visibilityPct: nullableMetricSchema,
  mentionedAnswers: z.number().int().nonnegative(),
  successfulAnswers: z.number().int().nonnegative(),
});

const reportDomainSchema = z.object({
  domain: z.string(),
  domainType: z.enum([
    "editorial",
    "corporate",
    "ugc",
    "reference",
    "institutional",
    "other",
    "unknown",
  ]),
  classificationMethod: z.enum([
    "manual",
    "curated_rule",
    "heuristic",
    "brand_registry",
    "unclassified",
  ]),
  citations: z.number().int().nonnegative(),
  citingAnswers: z.number().int().nonnegative(),
});

const reportGapSchema = z.object({
  domain: z.string(),
  competitorNames: z.array(z.string()),
  competitorMentionedAnswers: z.number().int().nonnegative(),
  citationsInCompetitorAnswers: z.number().int().nonnegative(),
});

export const publicReportSchema = z.object({
  version: z.literal(REPORT_CONTRACT_VERSION),
  generatedAt: z.string().datetime(),
  windowDays: visibilityWindowSchema,
  period: z.object({
    currentStart: z.string().datetime(),
    currentEnd: z.string().datetime(),
  }),
  project: z.object({
    name: z.string(),
    domain: z.string().nullable(),
  }),
  visibility: z.object({
    primaryBrandName: z.string().nullable(),
    visibilityPct: nullableMetricSchema,
    deltaPctPoints: nullableMetricSchema,
    comparisonStatus: z.enum([
      "available",
      "not_enough_elapsed_history",
      "no_previous_answers",
      "cohort_changed",
      "coverage_too_low",
    ]),
    comparisonMessage: z.string(),
    mentionedAnswers: z.number().int().nonnegative(),
    successfulAnswers: z.number().int().nonnegative(),
    failedAnswers: z.number().int().nonnegative(),
    expectedAnswers: z.number().int().nonnegative(),
    coveragePct: nullableMetricSchema,
    successfulModels: z.array(z.string()),
    platforms: z.array(reportVisibilityBreakdownSchema).max(8),
  }),
  citations: z.object({
    citations: z.number().int().nonnegative(),
    citedAnswers: z.number().int().nonnegative(),
    successfulAnswers: z.number().int().nonnegative(),
    uniqueDomains: z.number().int().nonnegative(),
    uniqueUrls: z.number().int().nonnegative(),
    avgCitationsPerAnswer: nullableMetricSchema,
    citedAnswerPct: nullableMetricSchema,
    topDomains: z.array(reportDomainSchema).max(10),
    competitorSourceGaps: z.array(reportGapSchema).max(10),
    gapScopeNote: z.string(),
    classificationNote: z.string(),
  }),
});

export const reportInputSchema = z.object({
  projectId: z.string().min(1),
  windowDays: z.coerce.number().pipe(visibilityWindowSchema).default(30),
});

export const reportSearchSchema = z.object({
  days: z.coerce
    .number()
    .pipe(visibilityWindowSchema)
    .optional()
    .catch(undefined),
});

export const createReportShareInputSchema = z.object({
  projectId: z.string().min(1),
  windowDays: visibilityWindowSchema.default(30),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
});

export const reportShareExpiryDaysSchema =
  createReportShareInputSchema.shape.expiresInDays;

export const revokeReportShareInputSchema = z.object({
  projectId: z.string().min(1),
  shareId: z.string().min(1),
});

export const reportProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const saveReportDigestInputSchema = z.object({
  projectId: z.string().min(1),
  enabled: z.boolean(),
  windowDays: visibilityWindowSchema.default(30),
});

export type PublicReport = z.infer<typeof publicReportSchema>;
export type ReportShareSummary = {
  id: string;
  windowDays: z.infer<typeof visibilityWindowSchema>;
  purpose: "manual" | "digest";
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
};
export type ReportDigestSettings = {
  enabled: boolean;
  windowDays: z.infer<typeof visibilityWindowSchema>;
  cadence: "weekly";
  recipientEmail: string;
  nextSendAt: string | null;
  lastSentAt: string | null;
  lastError: string | null;
  deliveryConfigured: boolean;
  sharingEnabled: boolean;
  sharingDisabledReason: string | null;
};
