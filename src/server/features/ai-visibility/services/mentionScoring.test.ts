import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelUsage } from "ai";
import {
  calculateScoringCost,
  parseSentimentScoringOutput,
  resolveCustomScoringPricing,
} from "./mentionScoring";
import { sentimentGoldenFixture } from "./mentionScoring.fixtures";

beforeEach(() => {
  vi.stubEnv("AI_SCORING_INPUT_USD_PER_MILLION", "");
  vi.stubEnv("AI_SCORING_OUTPUT_USD_PER_MILLION", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("mention sentiment scoring", () => {
  it("accepts the hand-labelled positive, negative, and neutral golden set", () => {
    const expected = sentimentGoldenFixture.map((item) => ({
      mentionId: item.mentionId,
      sentiment: item.sentiment,
    }));
    const parsed = parseSentimentScoringOutput(
      JSON.stringify({ mentions: expected }),
      sentimentGoldenFixture,
    );
    expect(parsed).toEqual(expected);
  });

  it("accepts an explicit null for genuinely mixed treatment", () => {
    expect(
      parseSentimentScoringOutput(
        JSON.stringify({
          mentions: [{ mentionId: "mixed", sentiment: null }],
        }),
        [{ mentionId: "mixed", brandName: "Acme" }],
      ),
    ).toEqual([{ mentionId: "mixed", sentiment: null }]);
  });

  it.each([
    {
      name: "unknown ID",
      output: { mentions: [{ mentionId: "invented", sentiment: "positive" }] },
    },
    {
      name: "duplicate ID",
      output: {
        mentions: [
          { mentionId: "known", sentiment: "positive" },
          { mentionId: "known", sentiment: "negative" },
        ],
      },
    },
    { name: "missing ID", output: { mentions: [] } },
    {
      name: "invented label",
      output: { mentions: [{ mentionId: "known", sentiment: "mixed" }] },
    },
  ])("rejects $name", ({ output }) => {
    expect(
      parseSentimentScoringOutput(JSON.stringify(output), [
        { mentionId: "known", brandName: "Known" },
      ]),
    ).toBeNull();
  });
});

describe("mention scoring cost", () => {
  it("uses actual OpenRouter cost without converting missing metadata to zero", () => {
    expect(
      calculateScoringCost({
        config: {
          kind: "openrouter",
          apiKey: "secret",
          modelId: "example/model",
        },
        usage: usage(120, 30),
        providerMetadata: {
          openrouter: { usage: { cost: 0.0042 } },
        },
        customPricing: null,
      }),
    ).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      costUsd: 0.0042,
      costBasis: "actual",
    });

    expect(
      calculateScoringCost({
        config: {
          kind: "openrouter",
          apiKey: "secret",
          modelId: "example/model",
        },
        usage: usage(120, 30),
        providerMetadata: undefined,
        customPricing: null,
      }).costUsd,
    ).toBeNull();
  });

  it("estimates custom-provider cost from snapshotted rates, including zero", () => {
    const config = {
      kind: "custom" as const,
      apiKey: "secret",
      modelId: "local-model",
      baseURL: "http://localhost:11434/v1",
    };
    expect(
      calculateScoringCost({
        config,
        usage: usage(1_000, 500),
        providerMetadata: undefined,
        customPricing: {
          inputUsdPerMillion: 2,
          outputUsdPerMillion: 4,
        },
      }),
    ).toMatchObject({ costUsd: 0.004, costBasis: "estimated" });
    expect(
      resolveCustomScoringPricing({
        AI_SCORING_INPUT_USD_PER_MILLION: "0",
        AI_SCORING_OUTPUT_USD_PER_MILLION: "0",
      }),
    ).toEqual({ inputUsdPerMillion: 0, outputUsdPerMillion: 0 });
  });

  it("keeps custom cost unknown when usage or pricing is absent", () => {
    expect(
      calculateScoringCost({
        config: {
          kind: "custom",
          apiKey: "secret",
          modelId: "custom-model",
          baseURL: "https://gateway.example/v1",
        },
        usage: usage(undefined, undefined),
        providerMetadata: undefined,
        customPricing: {
          inputUsdPerMillion: 1,
          outputUsdPerMillion: 1,
        },
      }),
    ).toMatchObject({ costUsd: null, costBasis: "unknown" });
  });
});

function usage(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): LanguageModelUsage {
  return {
    inputTokens,
    inputTokenDetails: {
      noCacheTokens: inputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokens,
    outputTokenDetails: {
      textTokens: outputTokens,
      reasoningTokens: 0,
    },
    totalTokens:
      inputTokens == null || outputTokens == null
        ? undefined
        : inputTokens + outputTokens,
  };
}
