import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelUsage } from "ai";
import type {
  aiAnswers,
  aiBrandMentions,
  aiMentionScoringAttempts,
} from "@/db/ai-visibility.schema";

vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({ AiVisibilityRepository: {} }),
);

import {
  executeAiMentionScoring,
  type AiMentionScoringDependencies,
} from "./aiMentionScoringExecution";

type Answer = typeof aiAnswers.$inferSelect;
type Mention = typeof aiBrandMentions.$inferSelect;
type Attempt = typeof aiMentionScoringAttempts.$inferSelect;

const work = {
  answerId: "answer-1",
  runId: "run-1",
  prompt: { id: "prompt-1", prompt: "Which studio is best?" },
  model: "chat_gpt" as const,
};

beforeEach(() => {
  vi.stubEnv("AI_SCORING_INPUT_USD_PER_MILLION", "");
  vi.stubEnv("AI_SCORING_OUTPUT_USD_PER_MILLION", "");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("executeAiMentionScoring", () => {
  it("scores only after reading a terminal answer and stores actual cost", async () => {
    const harness = createHarness(
      "Clay is excellent. Orbix is listed for comparison.",
    );
    const score = vi.fn().mockResolvedValue({
      status: "success",
      sentiments: [
        { mentionId: "1", sentiment: "positive" },
        { mentionId: "2", sentiment: "neutral" },
      ],
      usage: usage(200, 40),
      providerMetadata: { openrouter: { usage: { cost: 0.0035 } } },
      errorCode: null,
    });

    await expect(
      executeAiMentionScoring(work, "project-1", {
        ...harness.dependencies,
        score,
      }),
    ).resolves.toMatchObject({
      status: "success",
      costUsd: 0.0035,
      costBasis: "actual",
    });

    expect(score).toHaveBeenCalledTimes(1);
    expect(harness.mentions).toMatchObject([
      { brandId: "clay", position: 1, sentiment: "positive" },
      { brandId: "orbix", position: 2, sentiment: "neutral" },
    ]);
    expect(harness.attempt).toMatchObject({
      status: "success",
      inputTokens: 200,
      outputTokens: 40,
      costUsd: 0.0035,
      costBasis: "actual",
    });
  });

  it("degrades sentiment to null without rejecting when the scorer fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const harness = createHarness("Clay is an excellent option.");

    await expect(
      executeAiMentionScoring(work, "project-1", {
        ...harness.dependencies,
        score: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      }),
    ).resolves.toMatchObject({
      status: "failed",
      costBasis: "unknown",
    });

    expect(harness.mentions).toMatchObject([
      {
        brandId: "clay",
        position: 1,
        sentiment: null,
        scoringStatus: "failed",
      },
    ]);
    expect(harness.attempt).toMatchObject({
      status: "failed",
      costUsd: null,
      costBasis: "unknown",
      errorCode: "SCORING_ERROR",
    });
  });

  it("skips a custom provider before spend when explicit pricing is absent", async () => {
    const harness = createHarness("Orbix is a promising studio.", {
      AI_BASE_URL: "https://gateway.example/v1",
      AI_API_KEY: "secret",
      AI_MODEL: "custom-model",
    });
    const score = vi.fn();

    await expect(
      executeAiMentionScoring(work, "project-1", {
        ...harness.dependencies,
        score,
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "CUSTOM_SCORING_PRICING_REQUIRED",
    });

    expect(score).not.toHaveBeenCalled();
    expect(harness.mentions[0]).toMatchObject({
      position: 1,
      sentiment: null,
      scoringStatus: "skipped",
    });
    expect(harness.attempt).toMatchObject({
      providerKind: "custom",
      modelId: "custom-model",
      status: "skipped",
      costUsd: null,
      costBasis: "unknown",
    });
  });

  it("never scores an unsuccessful answer tuple", async () => {
    const harness = createHarness(null);
    harness.answer.status = "error";
    const score = vi.fn();
    await expect(
      executeAiMentionScoring(work, "project-1", {
        ...harness.dependencies,
        score,
      }),
    ).resolves.toEqual({
      status: "not_scored",
      reason: "answer_not_successful",
    });
    expect(score).not.toHaveBeenCalled();
    expect(harness.mentions).toHaveLength(0);
  });
});

function createHarness(
  responseText: string | null,
  env: Record<string, unknown> = { OPENROUTER_API_KEY: "secret" },
) {
  const answer: Answer = {
    id: "answer-1",
    runId: "run-1",
    trackedPromptId: "prompt-1",
    promptText: "Which studio is best?",
    model: "chat_gpt",
    modelName: "test-model",
    status: "success",
    responseText,
    errorCode: null,
    errorMessage: null,
    cacheKey: null,
    sourceFetchedAt: "2026-07-28T00:00:00.000Z",
    observedAt: "2026-07-28T00:00:00.000Z",
    outputTokens: 50,
    webSearch: true,
    fromCache: false,
    billingPath: "/test",
    providerCostUsd: 0.01,
    creditsConsumed: 1,
    attemptStartedAt: "2026-07-28T00:00:00.000Z",
    completedAt: "2026-07-28T00:00:01.000Z",
  };
  const mentions: Mention[] = [];
  let attempt: Attempt | null = null;
  let nextMentionId = 1;
  let tick = 0;
  const now = () => new Date(`2026-07-28T00:00:0${tick++}.000Z`);
  const repository: AiMentionScoringDependencies["repository"] = {
    async getAnswerById() {
      return answer;
    },
    async getBrandRegistry() {
      return {
        brands: [
          {
            id: "clay",
            projectId: "project-1",
            name: "Clay",
            normalizedName: "clay",
            domain: "clay.global",
            isPrimary: true,
            createdAt: "2026-07-28T00:00:00.000Z",
            updatedAt: "2026-07-28T00:00:00.000Z",
            archivedAt: null,
          },
          {
            id: "orbix",
            projectId: "project-1",
            name: "Orbix",
            normalizedName: "orbix",
            domain: "orbix.studio",
            isPrimary: false,
            createdAt: "2026-07-28T00:00:00.000Z",
            updatedAt: "2026-07-28T00:00:00.000Z",
            archivedAt: null,
          },
        ],
        aliases: [],
      };
    },
    async insertBrandMentions(values) {
      for (const value of values) {
        if (
          mentions.some(
            (mention) =>
              mention.answerId === value.answerId &&
              mention.normalizedName === value.normalizedName,
          )
        ) {
          continue;
        }
        mentions.push({
          id: nextMentionId++,
          answerId: value.answerId,
          rawName: value.rawName,
          normalizedName: value.normalizedName,
          brandId: value.brandId ?? null,
          mentionCount: value.mentionCount ?? 1,
          sentiment: value.sentiment ?? null,
          position: value.position ?? null,
          firstOccurrenceStart: value.firstOccurrenceStart ?? null,
          firstOccurrenceEnd: value.firstOccurrenceEnd ?? null,
          scoringStatus: value.scoringStatus ?? "pending",
          scoringAttemptId: value.scoringAttemptId ?? null,
          scoredAt: value.scoredAt ?? null,
          createdAt: "2026-07-28T00:00:00.000Z",
        });
      }
    },
    async getBrandMentionsForAnswer() {
      return mentions;
    },
    async getMentionScoringAttempt() {
      return attempt;
    },
    async tryCreateMentionScoringAttempt(value) {
      if (attempt) return false;
      attempt = {
        id: value.id,
        answerId: value.answerId,
        runId: value.runId,
        providerKind: value.providerKind,
        modelId: value.modelId,
        promptVersion: value.promptVersion,
        status: value.status ?? "running",
        inputTokens: value.inputTokens ?? null,
        outputTokens: value.outputTokens ?? null,
        costUsd: value.costUsd ?? null,
        costBasis: value.costBasis ?? "unknown",
        inputUsdPerMillion: value.inputUsdPerMillion ?? null,
        outputUsdPerMillion: value.outputUsdPerMillion ?? null,
        errorCode: value.errorCode ?? null,
        startedAt: value.startedAt ?? "2026-07-28T00:00:00.000Z",
        completedAt: value.completedAt ?? null,
      };
      return true;
    },
    async completeMentionScoring(value) {
      if (!attempt) throw new Error("attempt missing");
      attempt = {
        ...attempt,
        status: value.status,
        inputTokens: value.inputTokens,
        outputTokens: value.outputTokens,
        costUsd: value.costUsd,
        costBasis: value.costBasis,
        errorCode: value.errorCode,
        completedAt: value.completedAt,
      };
      const byId = new Map(
        (value.sentiments ?? []).map((item) => [
          item.mentionId,
          item.sentiment,
        ]),
      );
      for (const mention of mentions) {
        if (mention.scoringStatus !== "pending") continue;
        mention.sentiment = byId.get(mention.id) ?? null;
        mention.scoringStatus =
          value.status === "success"
            ? "scored"
            : value.status === "failed"
              ? "failed"
              : "skipped";
        mention.scoringAttemptId = value.attemptId;
        mention.scoredAt = value.completedAt;
      }
    },
  };
  const dependencies: AiMentionScoringDependencies = {
    repository,
    loadEnv: async () => env,
    score: vi.fn(),
    createId: () => "attempt-1",
    now,
  };
  return {
    answer,
    mentions,
    get attempt() {
      return attempt;
    },
    dependencies,
  };
}

function usage(inputTokens: number, outputTokens: number): LanguageModelUsage {
  return {
    inputTokens,
    inputTokenDetails: {
      noCacheTokens: inputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokens,
    outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
    totalTokens: inputTokens + outputTokens,
  };
}
