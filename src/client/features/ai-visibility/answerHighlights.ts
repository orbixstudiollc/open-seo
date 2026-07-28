import type { AnswerExplorerMention } from "@/types/schemas/ai-answer-explorer";

type AnswerTextSegment = {
  text: string;
  mention: AnswerExplorerMention | null;
};

export function buildAnswerTextSegments(
  text: string,
  mentions: AnswerExplorerMention[],
): AnswerTextSegment[] {
  const spans = mentions
    .filter(
      (mention) =>
        mention.start != null &&
        mention.end != null &&
        mention.start >= 0 &&
        mention.end > mention.start &&
        mention.end <= text.length,
    )
    .toSorted(
      (a, b) =>
        (a.start ?? 0) - (b.start ?? 0) ||
        (b.end ?? 0) - (a.end ?? 0) ||
        a.id - b.id,
    );
  const segments: AnswerTextSegment[] = [];
  let cursor = 0;
  for (const mention of spans) {
    const start = mention.start ?? 0;
    const end = mention.end ?? start;
    if (start < cursor) continue;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), mention: null });
    }
    segments.push({ text: text.slice(start, end), mention });
    cursor = end;
  }
  if (cursor < text.length || segments.length === 0) {
    segments.push({ text: text.slice(cursor), mention: null });
  }
  return segments;
}
