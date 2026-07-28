import { describe, expect, it } from "vitest";
import {
  listicleAnswerFixture,
  mentionRegistryFixture,
  tableAnswerFixture,
} from "./mentionScoring.fixtures";
import { detectRegisteredBrandMentions } from "./mentionDetection";

describe("detectRegisteredBrandMentions", () => {
  it("uses first distinct body-text order for a listicle and collapses aliases", () => {
    const mentions = detectRegisteredBrandMentions(
      listicleAnswerFixture,
      mentionRegistryFixture,
    );

    expect(mentions).toMatchObject([
      { brandId: "clay", position: 1, mentionCount: 2, rawName: "Clay Global" },
      {
        brandId: "orbix",
        position: 2,
        mentionCount: 1,
        rawName: "Orbix Studio",
      },
      { brandId: "figma", position: 3, mentionCount: 1, rawName: "Figma" },
    ]);
    expect(mentions.map((mention) => mention.brandId)).not.toContain(
      "wavespace",
    );
    for (const mention of mentions) {
      expect(
        listicleAnswerFixture.slice(
          mention.firstOccurrenceStart,
          mention.firstOccurrenceEnd,
        ),
      ).toBe(mention.rawName);
    }
  });

  it("preserves Markdown table row order and dense positions", () => {
    expect(
      detectRegisteredBrandMentions(tableAnswerFixture, mentionRegistryFixture),
    ).toMatchObject([
      {
        brandId: "wavespace",
        position: 1,
        rawName: "Wavespace Digital Agency",
      },
      { brandId: "lazarev", position: 2, rawName: "Lazarev.agency" },
      { brandId: "clay", position: 3, mentionCount: 2 },
    ]);
  });

  it("does not match a brand embedded inside a larger token", () => {
    expect(
      detectRegisteredBrandMentions(
        "Clayton is not Clay. Refigma is unrelated.",
        mentionRegistryFixture,
      ),
    ).toMatchObject([{ brandId: "clay", position: 1, mentionCount: 1 }]);
  });
});
