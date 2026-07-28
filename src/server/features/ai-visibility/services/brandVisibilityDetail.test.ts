import { describe, expect, it, vi } from "vitest";
import type {
  AnalyticsBrandRow,
  AnalyticsObservationRow,
} from "@/server/features/ai-visibility/repositories/AiVisibilityAnalyticsRepository";

vi.mock(
  "@/server/features/ai-visibility/repositories/AiAnswerExplorerRepository",
  () => ({ AiAnswerExplorerRepository: {} }),
);
vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityAnalyticsRepository",
  () => ({ AiVisibilityAnalyticsRepository: {} }),
);

import { buildBrandVisibilityDetail } from "./brandVisibilityDetail";

const AS_OF = new Date("2026-07-28T00:00:00.000Z");
const BRAND_ID = "brand-acme";

describe("buildBrandVisibilityDetail", () => {
  it("uses successful answers in a half-open window and keeps missing scores null", () => {
    const detail = buildBrandVisibilityDetail({
      asOf: AS_OF,
      windowDays: 7,
      brandId: BRAND_ID,
      runs: [],
      brands: [brand()],
      observations: [
        observation({
          answerId: "zero",
          startedAt: "2026-07-22T00:00:00.000Z",
        }),
        observation({
          answerId: "mention",
          startedAt: "2026-07-23T00:00:00.000Z",
          mentionCount: 2,
        }),
        observation({
          answerId: "boundary",
          startedAt: "2026-07-28T00:00:00.000Z",
          mentionCount: 9,
          sentiment: "positive",
          position: 1,
        }),
      ],
      citations: [],
    });

    expect(detail.metric).toEqual({
      successfulAnswers: 2,
      mentionedAnswers: 1,
      mentionCount: 2,
      mentionRatePct: 50,
      sentimentEstimate: null,
      averagePosition: null,
    });
    expect(detail.mentionTrend).toEqual([
      {
        date: "2026-07-22",
        mentions: 0,
        mentionedAnswers: 0,
        successfulAnswers: 1,
      },
      {
        date: "2026-07-23",
        mentions: 2,
        mentionedAnswers: 1,
        successfulAnswers: 1,
      },
    ]);
    expect(detail.citationOverlap.overlapPct).toBe(0);
  });

  it("averages scored sentiment and position and deduplicates citation overlap per answer", () => {
    const detail = buildBrandVisibilityDetail({
      asOf: AS_OF,
      windowDays: 7,
      brandId: BRAND_ID,
      runs: [],
      brands: [brand()],
      observations: [
        observation({
          answerId: "a",
          startedAt: "2026-07-23T00:00:00.000Z",
          mentionCount: 1,
          sentiment: "positive",
          position: 1,
        }),
        observation({
          answerId: "b",
          startedAt: "2026-07-24T00:00:00.000Z",
          mentionCount: 1,
          sentiment: "negative",
          position: 3,
        }),
      ],
      citations: [
        citation(1, "a", "docs.example"),
        citation(2, "a", "docs.example"),
        citation(3, "b", "news.example"),
      ],
    });

    expect(detail.metric.sentimentEstimate).toBe(0);
    expect(detail.metric.averagePosition).toBe(2);
    expect(detail.citationOverlap).toMatchObject({
      mentionedAnswers: 2,
      citedAnswers: 2,
      overlapPct: 100,
      domains: [
        { domain: "docs.example", answerCount: 1, overlapPct: 50 },
        { domain: "news.example", answerCount: 1, overlapPct: 50 },
      ],
    });
  });
});

function brand(): AnalyticsBrandRow {
  return {
    id: BRAND_ID,
    name: "Acme",
    normalizedName: "acme",
    isPrimary: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}

function observation(input: {
  answerId: string;
  startedAt: string;
  mentionCount?: number;
  sentiment?: "positive" | "neutral" | "negative";
  position?: number;
}): AnalyticsObservationRow {
  const mentioned = input.mentionCount != null;
  return {
    runId: `run-${input.answerId}`,
    runStartedAt: input.startedAt,
    promptSetId: "set-1",
    answerId: input.answerId,
    trackedPromptId: "prompt-1",
    promptText: "Which platform should I choose?",
    model: "chat_gpt",
    modelName: "model",
    responseText: `Answer ${input.answerId}`,
    answerObservedAt: input.startedAt,
    answerStatus: "success",
    topicId: null,
    topicName: null,
    mentionBrandId: mentioned ? BRAND_ID : null,
    mentionCount: input.mentionCount ?? null,
    mentionSentiment: input.sentiment ?? null,
    mentionPosition: input.position ?? null,
  };
}

function citation(id: number, answerId: string, domain: string) {
  return {
    id,
    answerId,
    order: id,
    url: `https://${domain}/${id}`,
    domain,
    title: null,
  };
}
