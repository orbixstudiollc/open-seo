import { describe, expect, it } from "vitest";
import { buildAnswerTextSegments } from "./answerHighlights";
import type { AnswerExplorerMention } from "@/types/schemas/ai-answer-explorer";

describe("buildAnswerTextSegments", () => {
  it("preserves raw text and marks only valid non-overlapping offsets", () => {
    const text = "Acme <strong>wins</strong>, then Rival.";
    const segments = buildAnswerTextSegments(text, [
      mention(1, "Acme", 0, 4),
      mention(2, "Rival", 33, 38),
      mention(3, "overlap", 1, 4),
      mention(4, "invalid", -1, 3),
    ]);

    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(
      segments
        .filter((segment) => segment.mention)
        .map((segment) => segment.text),
    ).toEqual(["Acme", "Rival"]);
    expect(segments.map((segment) => segment.text).join("")).toContain(
      "<strong>wins</strong>",
    );
  });

  it("returns the full text when no stored offset can be used", () => {
    expect(buildAnswerTextSegments("Plain answer", [])).toEqual([
      { text: "Plain answer", mention: null },
    ]);
  });
});

function mention(
  id: number,
  brandName: string,
  start: number,
  end: number,
): AnswerExplorerMention {
  return {
    id,
    brandId: `brand-${id}`,
    brandName,
    rawName: brandName,
    mentionCount: 1,
    sentiment: "neutral",
    position: id,
    start,
    end,
  };
}
