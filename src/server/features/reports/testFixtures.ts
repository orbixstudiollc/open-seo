import type { PublicReport } from "@/types/schemas/reports";

export function makePublicReport(
  overrides: Partial<PublicReport> = {},
): PublicReport {
  return {
    version: 1,
    generatedAt: "2026-07-28T12:00:00.000Z",
    windowDays: 30,
    period: {
      currentStart: "2026-06-28T12:00:00.000Z",
      currentEnd: "2026-07-28T12:00:00.000Z",
    },
    project: { name: "Acme Search", domain: "acme.example" },
    visibility: {
      primaryBrandName: "Acme",
      visibilityPct: 62.5,
      deltaPctPoints: 4.2,
      comparisonStatus: "available",
      comparisonMessage: "Compared with the previous equivalent period.",
      mentionedAnswers: 50,
      successfulAnswers: 80,
      failedAnswers: 2,
      expectedAnswers: 84,
      coveragePct: 95.2,
      successfulModels: ["chat_gpt", "claude"],
      platforms: [
        {
          label: "ChatGPT",
          visibilityPct: 66.7,
          mentionedAnswers: 20,
          successfulAnswers: 30,
        },
        {
          label: "Claude",
          visibilityPct: 57.1,
          mentionedAnswers: 16,
          successfulAnswers: 28,
        },
      ],
    },
    citations: {
      citations: 144,
      citedAnswers: 60,
      successfulAnswers: 80,
      uniqueDomains: 24,
      uniqueUrls: 76,
      avgCitationsPerAnswer: 1.8,
      citedAnswerPct: 75,
      topDomains: [
        {
          domain: "example.com",
          domainType: "editorial",
          classificationMethod: "curated_rule",
          citations: 22,
          citingAnswers: 14,
        },
        {
          domain: "docs.example.org",
          domainType: "reference",
          classificationMethod: "manual",
          citations: 13,
          citingAnswers: 10,
        },
      ],
      competitorSourceGaps: [
        {
          domain: "gap.example",
          competitorNames: ["Rival One", "Rival Two"],
          competitorMentionedAnswers: 8,
          citationsInCompetitorAnswers: 11,
        },
      ],
      gapScopeNote:
        "Domains cited with tracked competitors and never the primary brand.",
      classificationNote:
        "Domain labels use reviewed overrides and maintained rules.",
    },
    ...overrides,
  };
}
