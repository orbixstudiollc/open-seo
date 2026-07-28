import { describe, expect, it } from "vitest";
import type {
  AnalyticsBrandRow,
  AnalyticsObservationRow,
  AnalyticsRunRow,
} from "@/server/features/ai-visibility/repositories/AiVisibilityAnalyticsRepository";
import { buildVisibilityOverview } from "./visibilityAnalytics";

const PRIMARY_ID = "brand-acme";
const COMPETITOR_ID = "brand-rival";
const AS_OF = new Date("2026-07-28T00:00:00.000Z");
const RUNS: AnalyticsRunRow[] = [
  {
    id: "history",
    startedAt: "2026-07-14T00:00:00.000Z",
    answersExpected: 1,
  },
  {
    id: "current",
    startedAt: "2026-07-22T00:00:00.000Z",
    answersExpected: 1,
  },
];
const BRANDS: AnalyticsBrandRow[] = [
  brand(PRIMARY_ID, "Acme", true),
  brand(COMPETITOR_ID, "Rival", false),
];
const OBSERVATIONS: AnalyticsObservationRow[] = [
  observation({
    runId: "history",
    runStartedAt: "2026-07-14T00:00:00.000Z",
    answerId: "history-answer",
    brandId: null,
  }),
  observation({
    runId: "current",
    runStartedAt: "2026-07-22T00:00:00.000Z",
    answerId: "current-answer",
    brandId: PRIMARY_ID,
    mentionCount: 5,
    sentiment: "negative",
    position: 1,
  }),
  observation({
    runId: "current",
    runStartedAt: "2026-07-22T00:00:00.000Z",
    answerId: "current-answer",
    brandId: COMPETITOR_ID,
    sentiment: "positive",
    position: 2,
  }),
];

describe("visibility brand leaderboard", () => {
  it("sorts by model-estimated sentiment with nulls last", () => {
    const leaderboard = overview("sentiment").shareOfVoice;
    expect(leaderboard).toMatchObject({
      sortBy: "sentiment",
      entries: [
        {
          brandId: COMPETITOR_ID,
          sentimentEstimate: 1,
          averagePosition: 2,
          scoredAnswers: 1,
        },
        {
          brandId: PRIMARY_ID,
          sentimentEstimate: -1,
          averagePosition: 1,
          scoredAnswers: 1,
        },
      ],
    });
  });

  it("sorts by average first-mention position despite higher mention volume", () => {
    expect(
      overview("position").shareOfVoice?.entries.map((entry) => entry.brandId),
    ).toEqual([PRIMARY_ID, COMPETITOR_ID]);
  });
});

function overview(sort: "sentiment" | "position") {
  return buildVisibilityOverview({
    asOf: AS_OF,
    windowDays: 7,
    runs: RUNS,
    observations: OBSERVATIONS,
    brands: BRANDS,
    leaderboardSort: sort,
  });
}

function observation(input: {
  runId: string;
  runStartedAt: string;
  answerId: string;
  brandId: string | null;
  mentionCount?: number;
  sentiment?: "positive" | "neutral" | "negative";
  position?: number;
}): AnalyticsObservationRow {
  return {
    runId: input.runId,
    runStartedAt: input.runStartedAt,
    answerId: input.answerId,
    trackedPromptId: "prompt-a",
    promptText: "Which platform should I choose?",
    model: "chat_gpt",
    modelName: "test-model",
    answerStatus: "success",
    topicId: null,
    topicName: null,
    mentionBrandId: input.brandId,
    mentionCount: input.brandId ? (input.mentionCount ?? 1) : null,
    mentionSentiment: input.sentiment ?? null,
    mentionPosition: input.position ?? null,
  };
}

function brand(
  id: string,
  name: string,
  isPrimary: boolean,
): AnalyticsBrandRow {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    isPrimary,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}
