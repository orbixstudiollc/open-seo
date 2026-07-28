import type { VisibilityDeltaStatus } from "@/types/schemas/ai-visibility-analytics";

// Single source for AI-answer model display labels, shared by the server
// breakdown shaping and the client platform lists so the two cannot drift.
const AI_MODEL_LABELS: Record<string, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google: "Google",
};

export function formatAiModelLabel(model: string): string {
  return AI_MODEL_LABELS[model] ?? model.replaceAll(/[_-]+/gu, " ");
}

// Comparison-status copy. Only two of the non-available statuses are about
// history; the others previously rendered under a misleading blanket
// "Insufficient history" heading.
const DELTA_STATUS_HEADINGS: Record<
  Exclude<VisibilityDeltaStatus, "available">,
  { heading: string; badge: string }
> = {
  not_enough_elapsed_history: {
    heading: "Insufficient history.",
    badge: "Insufficient history",
  },
  no_previous_answers: {
    heading: "No previous answers.",
    badge: "No previous answers",
  },
  cohort_changed: {
    heading: "Cohort changed.",
    badge: "Cohort changed",
  },
  coverage_too_low: {
    heading: "Coverage too low.",
    badge: "Coverage too low",
  },
};

export function visibilityDeltaHeading(
  status: VisibilityDeltaStatus,
): { heading: string; badge: string } | null {
  if (status === "available") return null;
  return DELTA_STATUS_HEADINGS[status];
}
