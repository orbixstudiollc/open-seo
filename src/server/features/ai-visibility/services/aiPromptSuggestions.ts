import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

type PromptSuggestionCandidate = {
  prompt: string;
  topicId: string | null;
  source: "gsc" | "topic_gap";
};

type PromptDefinition = {
  topics: Array<{
    id: string;
    name: string;
    normalizedName: string;
    archivedAt: string | null;
  }>;
  prompts: Array<{
    topicId: string | null;
    normalizedPrompt: string;
    state: "active" | "suggested" | "rejected";
    archivedAt: string | null;
  }>;
};

const QUESTION_START =
  /^(?:who|what|when|where|why|how|which|can|could|do|does|is|are|should|would|will)\b/i;
const COMPARISON_SHAPE =
  /\b(?:vs\.?|versus|compare|comparison|alternative|alternatives|better than|best|top)\b/i;
const TOPIC_GAP_TARGET = 3;

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function promptKey(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase();
}

function capitalize(value: string) {
  return value.length === 0
    ? value
    : value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

export function gscQueryToPrompt(query: string): string | null {
  const normalized = normalizeWhitespace(query).replace(/[.!?]+$/, "");
  if (!normalized || normalized.length > 460) return null;
  if (QUESTION_START.test(normalized)) {
    return `${capitalize(normalized)}?`;
  }
  if (!COMPARISON_SHAPE.test(normalized)) return null;
  if (/^(?:best|top)\b/i.test(normalized)) {
    return `What are the ${normalized.toLocaleLowerCase()}?`;
  }
  return `Compare options for ${normalized}.`;
}

function topicForPrompt(
  prompt: string,
  topics: PromptDefinition["topics"],
): string | null {
  const key = promptKey(prompt);
  return (
    topics.find(
      (topic) =>
        !topic.archivedAt &&
        topic.normalizedName.length > 2 &&
        key.includes(topic.normalizedName.toLocaleLowerCase()),
    )?.id ?? null
  );
}

export function buildGscPromptSuggestions(
  rows: GscSearchAnalyticsRow[],
  definition: PromptDefinition,
  limit = 25,
): PromptSuggestionCandidate[] {
  const seen = new Set(
    definition.prompts.map((prompt) => promptKey(prompt.normalizedPrompt)),
  );
  const suggestions: PromptSuggestionCandidate[] = [];
  const rankedRows = rows
    .filter((row) => row.impressions > 0)
    .toSorted((a, b) => b.impressions - a.impressions);

  for (const row of rankedRows) {
    const query = row.keys?.[0];
    if (!query) continue;
    const prompt = gscQueryToPrompt(query);
    if (!prompt) continue;
    const key = promptKey(prompt);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      prompt,
      topicId: topicForPrompt(prompt, definition.topics),
      source: "gsc",
    });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

function topicTemplates(topic: string): string[] {
  return [
    `What are the best options for ${topic}?`,
    `How do buyers compare solutions for ${topic}?`,
    `What should someone consider when choosing a solution for ${topic}?`,
  ];
}

export function buildTopicGapSuggestions(
  definition: PromptDefinition,
  limit = 25,
): PromptSuggestionCandidate[] {
  const seen = new Set(
    definition.prompts.map((prompt) => promptKey(prompt.normalizedPrompt)),
  );
  const suggestions: PromptSuggestionCandidate[] = [];
  for (const topic of definition.topics) {
    if (topic.archivedAt) continue;
    const coveredCount = definition.prompts.filter(
      (prompt) =>
        prompt.topicId === topic.id &&
        prompt.state !== "rejected" &&
        !prompt.archivedAt,
    ).length;
    const needed = Math.max(TOPIC_GAP_TARGET - coveredCount, 0);
    let added = 0;
    for (const prompt of topicTemplates(topic.name)) {
      if (added >= needed || suggestions.length >= limit) break;
      const key = promptKey(prompt);
      if (seen.has(key)) continue;
      seen.add(key);
      added += 1;
      suggestions.push({
        prompt,
        topicId: topic.id,
        source: "topic_gap",
      });
    }
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}
