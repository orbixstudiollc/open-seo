import { describe, expect, it } from "vitest";
import type {
  CitationClassificationRow,
  CitationIntelligenceAnswerRow,
  CitationIntelligenceBrandRow,
  CitationIntelligenceCitationRow,
  CitationIntelligenceMentionRow,
  CitationIntelligenceRunRow,
} from "@/server/features/ai-visibility/repositories/AiCitationIntelligenceRepository";
import type { VisibilityWindow } from "@/types/schemas/ai-visibility-analytics";
import {
  buildCitationIntelligenceOverview,
  buildCitationRecommendationGaps,
} from "./citationIntelligence";

const AS_OF = new Date("2026-07-28T00:00:00.000Z");

const answers: CitationIntelligenceAnswerRow[] = [
  answer("current-start", "2026-07-21T00:00:00.000Z"),
  answer("competitor-gap", "2026-07-22T12:00:00.000Z"),
  answer("primary-exclusion", "2026-07-23T12:00:00.000Z"),
  answer("competitor-mixed", "2026-07-24T12:00:00.000Z"),
  answer("observed-zero", "2026-07-25T12:00:00.000Z"),
  answer("failed", "2026-07-26T12:00:00.000Z", "error"),
  answer("current-end", "2026-07-28T00:00:00.000Z"),
  answer("thirty-day", "2026-07-10T12:00:00.000Z"),
  answer("ninety-day", "2026-05-10T12:00:00.000Z"),
  answer("older", "2026-04-20T12:00:00.000Z"),
];

const citations: CitationIntelligenceCitationRow[] = [
  citation("current-start", "https://www.example.com/guide?x=1", 0),
  citation("current-start", "https://news.example.com/story", 1),
  citation("competitor-gap", "https://gap.com/a", 0),
  citation("competitor-gap", "https://gap.com/b", 1),
  citation("competitor-gap", "https://docs.mixed.com/competitor", 2),
  citation("primary-exclusion", "https://www.mixed.com/you", 0),
  citation("competitor-mixed", "https://gap.com/a", 0),
  citation("competitor-mixed", "https://reddit.com/r/seo", 1),
  citation("failed", "https://ignored.example/failure", 0),
  citation("current-end", "https://ignored.example/end", 0),
  citation("thirty-day", "https://month.example/guide", 0),
  citation("ninety-day", "https://quarter.example/guide", 0),
  citation("older", "https://old.example/guide", 0),
  citation(
    "competitor-gap",
    `https://overflow.example/${"x".repeat(2_100)}`,
    3,
  ),
];

const mentions: CitationIntelligenceMentionRow[] = [
  mention("competitor-gap", "competitor-beta"),
  mention("competitor-mixed", "competitor-beta"),
  mention("competitor-mixed", "competitor-gamma"),
  mention("primary-exclusion", "primary"),
  mention("failed", "competitor-beta"),
];

const brands: CitationIntelligenceBrandRow[] = [
  brand("primary", "Acme", "acme", true, "acme.com"),
  brand("competitor-beta", "Beta", "beta", false, "beta.com"),
  brand("competitor-gamma", "Gamma", "gamma", false, "gamma.com"),
  {
    ...brand("archived", "Old Rival", "old rival", false, "old-rival.com"),
    archivedAt: "2026-07-01T00:00:00.000Z",
  },
];

const classifications: CitationClassificationRow[] = [
  {
    domain: "gap.com",
    matchScope: "registrable_domain",
    domainType: "editorial",
    method: "manual",
    ruleVersion: "reviewed-gap-v1",
    confidence: 1,
    reviewedAt: "2026-07-20T00:00:00.000Z",
  },
];

describe("citation intelligence rollups", () => {
  it("rolls up domains, exact URLs, and density across seeded periods", () => {
    const seven = build(7);
    const thirty = build(30);
    const ninety = build(90);

    expect(seven.metric).toEqual({
      citations: 8,
      citedAnswers: 4,
      successfulAnswers: 5,
      uniqueDomains: 4,
      uniqueUrls: 7,
      avgCitationsPerAnswer: 1.6,
      citedAnswerPct: 80,
    });
    expect(thirty.metric.citations).toBe(9);
    expect(thirty.metric.successfulAnswers).toBe(6);
    expect(ninety.metric.citations).toBe(10);
    expect(ninety.metric.successfulAnswers).toBe(7);

    expect(seven.period).toEqual({
      currentStart: "2026-07-21T00:00:00.000Z",
      currentEnd: "2026-07-28T00:00:00.000Z",
      previousStart: "2026-07-14T00:00:00.000Z",
      previousEnd: "2026-07-21T00:00:00.000Z",
    });
    expect(seven.domains[0]).toMatchObject({
      domain: "gap.com",
      citations: 3,
      citingAnswers: 2,
      avgCitationsPerAnswer: 0.6,
      classification: {
        domainType: "editorial",
        method: "manual",
      },
    });
    expect(
      seven.domains.find((row) => row.domain === "example.com"),
    ).toMatchObject({
      hostnames: ["example.com", "news.example.com"],
      citations: 2,
      citingAnswers: 1,
    });
    expect(seven.urls[0]).toMatchObject({
      url: "https://gap.com/a",
      citations: 2,
      citingAnswers: 2,
      avgCitationsPerAnswer: 0.4,
    });
    expect(seven.urls.map((row) => row.url)).not.toContain(
      expect.stringContaining("overflow.example"),
    );
  });

  it("keeps observed zero-citation days and omits missing or failed-only days", () => {
    const result = build(7);

    expect(result.trend.map((point) => point.date)).toEqual([
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
    expect(result.trend.at(-1)).toEqual({
      date: "2026-07-25",
      citations: 0,
      citedAnswers: 0,
      successfulAnswers: 1,
      avgCitationsPerAnswer: 0,
    });
  });

  it("excludes a competitor-cited domain after one primary-brand co-occurrence", () => {
    const result = build(7);

    expect(result.gapReport.trackedCompetitors).toBe(2);
    expect(result.gapReport.totalDomains).toBe(2);
    expect(result.gapReport.truncated).toBe(false);
    expect(result.gapReport.entries.map((entry) => entry.domain)).toEqual([
      "gap.com",
      "reddit.com",
    ]);
    expect(result.gapReport.entries).not.toContainEqual(
      expect.objectContaining({ domain: "mixed.com" }),
    );
    expect(result.gapReport.entries[0]).toMatchObject({
      domain: "gap.com",
      competitorMentionedAnswers: 2,
      citationsInCompetitorAnswers: 3,
      totalCitations: 3,
      competitorBrands: [
        { id: "competitor-beta", name: "Beta" },
        { id: "competitor-gamma", name: "Gamma" },
      ],
    });
    expect(result.gapReport.entries[1]).toMatchObject({
      domain: "reddit.com",
      classification: {
        domainType: "ugc",
        method: "curated_rule",
      },
    });
    expect(result.gapReport.scopeNote).toContain("zero Acme-mentioned");
  });

  it("does not produce a gap report without a primary brand", () => {
    const result = build(
      7,
      brands.map((item) => ({ ...item, isPrimary: false })),
    );

    expect(result.primaryBrand).toBeNull();
    expect(result.gapReport.entries).toEqual([]);
    expect(result.gapReport.scopeNote).toContain("Set a primary brand");
  });

  it("resolves Phase 5 gaps to exact citation and competitor evidence", () => {
    const targets = buildCitationRecommendationGaps({
      asOf: AS_OF,
      windowDays: 7,
      runs: answers.map((row) => ({
        id: row.runId,
        startedAt: row.runStartedAt,
      })),
      answers,
      citations,
      mentions,
      brands,
      classifications,
    });

    expect(targets.map((target) => target.targetUrl)).not.toContain(
      "https://docs.mixed.com/competitor",
    );
    expect(
      targets.find((target) => target.targetUrl === "https://gap.com/a"),
    ).toMatchObject({
      targetHostname: "gap.com",
      targetDomain: "gap.com",
      citationCount: 2,
      answerCount: 2,
      promptCount: 2,
      targetBrandCitationCount: 0,
      competitorBrands: [
        { id: "competitor-beta", name: "Beta" },
        { id: "competitor-gamma", name: "Gamma" },
      ],
    });
    const gapEvidence = targets.find(
      (target) => target.targetUrl === "https://gap.com/a",
    )!.evidence;
    expect(new Set(gapEvidence.map((row) => row.citationId))).toHaveLength(2);
    expect(
      gapEvidence.map((row) => row.competitorBrandName).toSorted(),
    ).toEqual(["Beta", "Beta", "Gamma"]);
    expect(
      targets.find((target) => target.targetUrl === "https://reddit.com/r/seo")
        ?.targetCommunity,
    ).toBe("r/seo");
  });
});

function build(windowDays: VisibilityWindow, brandRows = brands) {
  return buildCitationIntelligenceOverview({
    asOf: AS_OF,
    windowDays,
    runs: answers.map((row) => ({
      id: row.runId,
      startedAt: row.runStartedAt,
    })) satisfies CitationIntelligenceRunRow[],
    answers,
    citations,
    mentions,
    brands: brandRows,
    classifications,
  });
}

function answer(
  id: string,
  runStartedAt: string,
  status: "success" | "error" = "success",
): CitationIntelligenceAnswerRow {
  return {
    id,
    runId: `run-${id}`,
    runStartedAt,
    trackedPromptId: `prompt-${id}`,
    promptText: `Prompt for ${id}`,
    model: "chat_gpt",
    observedAt: runStartedAt,
    status,
  };
}

function citation(
  answerId: string,
  url: string,
  citationOrder: number,
): CitationIntelligenceCitationRow {
  return {
    id: stableFixtureId(answerId, citationOrder),
    answerId,
    url,
    citationOrder,
    title: `Title ${citationOrder}`,
  };
}

function stableFixtureId(answerId: string, order: number): number {
  let value = 7;
  for (let index = 0; index < answerId.length; index += 1) {
    value = value * 31 + answerId.charCodeAt(index);
  }
  return value + order;
}

function mention(
  answerId: string,
  brandId: string | null,
): CitationIntelligenceMentionRow {
  return { answerId, brandId, mentionCount: 1 };
}

function brand(
  id: string,
  name: string,
  normalizedName: string,
  isPrimary: boolean,
  domain: string,
): CitationIntelligenceBrandRow {
  return {
    id,
    name,
    normalizedName,
    domain,
    isPrimary,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}
