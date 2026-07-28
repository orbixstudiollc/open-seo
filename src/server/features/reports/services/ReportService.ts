import { getCitationIntelligenceOverview } from "@/server/features/ai-visibility/services/citationIntelligence";
import { getVisibilityOverview } from "@/server/features/ai-visibility/services/visibilityAnalytics";
import {
  publicReportSchema,
  REPORT_CONTRACT_VERSION,
  type PublicReport,
} from "@/types/schemas/reports";
import type { VisibilityWindow } from "@/types/schemas/ai-visibility-analytics";

type ReportProject = {
  id: string;
  name: string;
  domain: string | null;
};

export async function buildProjectReport(input: {
  project: ReportProject;
  windowDays: VisibilityWindow;
  asOf?: Date;
}): Promise<PublicReport> {
  const asOf = input.asOf ?? new Date();
  const [visibility, citations] = await Promise.all([
    getVisibilityOverview({
      projectId: input.project.id,
      windowDays: input.windowDays,
      asOf,
    }),
    getCitationIntelligenceOverview({
      projectId: input.project.id,
      windowDays: input.windowDays,
      asOf,
    }),
  ]);

  return publicReportSchema.parse({
    version: REPORT_CONTRACT_VERSION,
    generatedAt: asOf.toISOString(),
    windowDays: input.windowDays,
    period: {
      currentStart: visibility.period.currentStart,
      currentEnd: visibility.period.currentEnd,
    },
    project: {
      name: input.project.name,
      domain: input.project.domain,
    },
    visibility: {
      primaryBrandName: visibility.primaryBrand?.name ?? null,
      visibilityPct: visibility.metric.visibilityPct,
      deltaPctPoints: visibility.comparison.deltaPctPoints,
      comparisonStatus: visibility.comparison.status,
      comparisonMessage: visibility.comparison.message,
      mentionedAnswers: visibility.metric.mentionedAnswers,
      successfulAnswers: visibility.metric.successfulAnswers,
      failedAnswers: visibility.metric.failedAnswers,
      expectedAnswers: visibility.metric.expectedAnswers,
      coveragePct: visibility.metric.coveragePct,
      successfulModels: visibility.successfulModels,
      platforms: visibility.platforms.slice(0, 8).map((row) => ({
        label: row.label,
        visibilityPct: row.metric.visibilityPct,
        mentionedAnswers: row.metric.mentionedAnswers,
        successfulAnswers: row.metric.successfulAnswers,
      })),
    },
    citations: {
      citations: citations.metric.citations,
      citedAnswers: citations.metric.citedAnswers,
      successfulAnswers: citations.metric.successfulAnswers,
      uniqueDomains: citations.metric.uniqueDomains,
      uniqueUrls: citations.metric.uniqueUrls,
      avgCitationsPerAnswer: citations.metric.avgCitationsPerAnswer,
      citedAnswerPct: citations.metric.citedAnswerPct,
      topDomains: citations.domains.slice(0, 10).map((row) => ({
        domain: row.domain,
        domainType: row.classification.domainType,
        classificationMethod: row.classification.method,
        citations: row.citations,
        citingAnswers: row.citingAnswers,
      })),
      competitorSourceGaps: citations.gapReport.entries
        .slice(0, 10)
        .map((row) => ({
          domain: row.domain,
          competitorNames: row.competitorBrands.map((brand) => brand.name),
          competitorMentionedAnswers: row.competitorMentionedAnswers,
          citationsInCompetitorAnswers: row.citationsInCompetitorAnswers,
        })),
      gapScopeNote: citations.gapReport.scopeNote,
      classificationNote: citations.classificationNote,
    },
  });
}
