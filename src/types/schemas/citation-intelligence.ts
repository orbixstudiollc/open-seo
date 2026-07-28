import { z } from "zod";
import { visibilityWindowSchema } from "./ai-visibility-analytics";

export const citationIntelligenceInputSchema = z.object({
  projectId: z.string().min(1),
  windowDays: visibilityWindowSchema.default(30),
});

export const citationIntelligenceSearchSchema = z.object({
  days: z.coerce
    .number()
    .pipe(visibilityWindowSchema)
    .optional()
    .catch(undefined),
});

export type CitationDomainType =
  | "editorial"
  | "corporate"
  | "ugc"
  | "reference"
  | "institutional"
  | "other"
  | "unknown";

export type CitationClassificationMethod =
  | "manual"
  | "curated_rule"
  | "heuristic"
  | "brand_registry"
  | "unclassified";

export type CitationDomainClassification = {
  domainType: CitationDomainType;
  method: CitationClassificationMethod;
  matchScope: "hostname" | "registrable_domain" | null;
  ruleVersion: string | null;
  confidence: number | null;
};

export type CitationDensityMetric = {
  citations: number;
  citedAnswers: number;
  successfulAnswers: number;
  uniqueDomains: number;
  uniqueUrls: number;
  avgCitationsPerAnswer: number | null;
  citedAnswerPct: number | null;
};

export type CitationDomainRollup = {
  domain: string;
  hostnames: string[];
  classification: CitationDomainClassification;
  citations: number;
  citingAnswers: number;
  avgCitationsPerAnswer: number;
};

export type CitationUrlRollup = {
  url: string;
  title: string | null;
  domain: string;
  hostname: string;
  citations: number;
  citingAnswers: number;
  avgCitationsPerAnswer: number;
};

export type CompetitorSourceGap = {
  domain: string;
  classification: CitationDomainClassification;
  competitorBrands: Array<{ id: string; name: string }>;
  competitorMentionedAnswers: number;
  citationsInCompetitorAnswers: number;
  totalCitations: number;
};

export type CitationIntelligenceOverview = {
  asOf: string;
  windowDays: z.infer<typeof visibilityWindowSchema>;
  period: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
  };
  primaryBrand: { id: string; name: string } | null;
  metric: CitationDensityMetric;
  trend: Array<{
    date: string;
    citations: number;
    citedAnswers: number;
    successfulAnswers: number;
    avgCitationsPerAnswer: number;
  }>;
  domains: CitationDomainRollup[];
  urls: CitationUrlRollup[];
  gapReport: {
    trackedCompetitors: number;
    totalDomains: number;
    truncated: boolean;
    scopeNote: string;
    entries: CompetitorSourceGap[];
  };
  classificationNote: string;
};
