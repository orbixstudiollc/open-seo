import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visibility: vi.fn(),
  citations: vi.fn(),
}));

vi.mock("@/server/features/ai-visibility/services/visibilityAnalytics", () => ({
  getVisibilityOverview: mocks.visibility,
}));
vi.mock(
  "@/server/features/ai-visibility/services/citationIntelligence",
  () => ({ getCitationIntelligenceOverview: mocks.citations }),
);

import { buildProjectReport } from "./ReportService";

describe("ReportService public DTO", () => {
  beforeEach(() => {
    mocks.visibility.mockReset();
    mocks.citations.mockReset();
    mocks.visibility.mockResolvedValue({
      asOf: "2026-07-28T12:00:00.000Z",
      windowDays: 30,
      period: {
        currentStart: "2026-06-28T12:00:00.000Z",
        currentEnd: "2026-07-28T12:00:00.000Z",
        previousStart: "2026-05-29T12:00:00.000Z",
        previousEnd: "2026-06-28T12:00:00.000Z",
      },
      primaryBrand: { id: "private-brand-id", name: "Acme" },
      metric: {
        visibilityPct: 50,
        mentionedAnswers: 10,
        successfulAnswers: 20,
        failedAnswers: 1,
        expectedAnswers: 24,
        coveragePct: 83.3,
      },
      comparison: {
        status: "available",
        message: "Compared with the previous equivalent period.",
        deltaPctPoints: 5,
        previousVisibilityPct: 45,
      },
      successfulModels: ["chat_gpt"],
      trend: [{ date: "2026-07-27", privateObservationId: "answer-id" }],
      platforms: [
        {
          key: "private-platform-key",
          label: "ChatGPT",
          detail: "model",
          metric: {
            visibilityPct: 50,
            mentionedAnswers: 10,
            successfulAnswers: 20,
            failedAnswers: 1,
            expectedAnswers: 24,
            coveragePct: 83.3,
          },
        },
      ],
      topics: [{ promptText: "private prompt" }],
      prompts: [{ responseText: "private answer" }],
      shareOfVoice: { privateCompetitorIds: ["competitor-id"] },
      newlyAddedPrivateField: "must not pass through",
    });
    mocks.citations.mockResolvedValue({
      asOf: "2026-07-28T12:00:00.000Z",
      windowDays: 30,
      period: {
        currentStart: "2026-06-28T12:00:00.000Z",
        currentEnd: "2026-07-28T12:00:00.000Z",
        previousStart: "2026-05-29T12:00:00.000Z",
        previousEnd: "2026-06-28T12:00:00.000Z",
      },
      primaryBrand: { id: "private-brand-id", name: "Acme" },
      metric: {
        citations: 32,
        citedAnswers: 12,
        successfulAnswers: 20,
        uniqueDomains: 7,
        uniqueUrls: 18,
        avgCitationsPerAnswer: 1.6,
        citedAnswerPct: 60,
      },
      trend: [],
      domains: [
        {
          domain: "example.com",
          hostnames: ["www.example.com"],
          classification: {
            domainType: "editorial",
            method: "curated_rule",
            matchScope: "registrable_domain",
            ruleVersion: "v1",
            confidence: 1,
          },
          citations: 12,
          citingAnswers: 8,
          avgCitationsPerAnswer: 0.6,
        },
      ],
      urls: [
        {
          url: "https://example.com/private-path?token=secret",
          title: "Private exact URL",
        },
      ],
      gapReport: {
        trackedCompetitors: 1,
        totalDomains: 1,
        truncated: false,
        scopeNote: "Stored co-occurrence.",
        entries: [
          {
            domain: "gap.example",
            classification: {
              domainType: "unknown",
              method: "unclassified",
            },
            competitorBrands: [{ id: "private-competitor-id", name: "Rival" }],
            competitorMentionedAnswers: 4,
            citationsInCompetitorAnswers: 6,
            totalCitations: 8,
          },
        ],
      },
      classificationNote: "Reviewed labels.",
      providerPayload: { secret: true },
    });
  });

  it("uses one clock and returns only the explicit versioned allowlist", async () => {
    const asOf = new Date("2026-07-28T12:00:00.000Z");
    const report = await buildProjectReport({
      project: {
        id: "private-project-id",
        name: "Acme project",
        domain: "acme.example",
      },
      windowDays: 30,
      asOf,
    });
    const serialized = JSON.stringify(report);

    expect(mocks.visibility).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "private-project-id", asOf }),
    );
    expect(mocks.citations).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "private-project-id", asOf }),
    );
    expect(report).toMatchObject({
      version: 1,
      project: { name: "Acme project", domain: "acme.example" },
      visibility: { primaryBrandName: "Acme", visibilityPct: 50 },
      citations: {
        topDomains: [{ domain: "example.com" }],
        competitorSourceGaps: [
          { domain: "gap.example", competitorNames: ["Rival"] },
        ],
      },
    });
    for (const forbidden of [
      "private-project-id",
      "private-brand-id",
      "private-competitor-id",
      "private-path",
      "responseText",
      "providerPayload",
      "newlyAddedPrivateField",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
