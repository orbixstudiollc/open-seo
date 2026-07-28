import { z } from "zod";
import { promptExplorerModelSchema } from "@/types/schemas/ai-search";
import { visibilityWindowSchema } from "@/types/schemas/ai-visibility-analytics";

export const AI_ANSWER_EXPLORER_PAGE_SIZE = 8;

const entityIdSchema = z.string().trim().min(1).max(200);

export const answerExplorerInputSchema = z.object({
  projectId: entityIdSchema,
  answerId: entityIdSchema.optional(),
  trackedPromptId: entityIdSchema.optional(),
  model: promptExplorerModelSchema.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
});

export const answerExplorerSearchSchema = z.object({
  answerId: entityIdSchema.optional().catch(undefined),
  promptId: entityIdSchema.optional().catch(undefined),
  model: promptExplorerModelSchema.optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export const brandVisibilityDetailInputSchema = z.object({
  projectId: entityIdSchema,
  brandId: entityIdSchema,
  windowDays: visibilityWindowSchema.default(30),
});

export type AnswerExplorerMention = {
  id: number;
  brandId: string | null;
  brandName: string;
  rawName: string;
  mentionCount: number;
  sentiment: "positive" | "neutral" | "negative" | null;
  position: number | null;
  start: number | null;
  end: number | null;
};

export type AnswerExplorerCitation = {
  id: number;
  answerId: string;
  order: number;
  url: string;
  domain: string | null;
  title: string | null;
};

export type AnswerExplorerItem = {
  id: string;
  runId: string;
  promptSetId: string;
  trackedPromptId: string;
  promptText: string;
  model: string;
  modelName: string | null;
  responseText: string;
  observedAt: string;
  mentions: AnswerExplorerMention[];
  citations: AnswerExplorerCitation[];
};

export type RunnableTrackedPrompt = {
  promptSetId: string;
  promptSetName: string;
  trackedPromptId: string;
  promptText: string;
  enabledModels: string[];
};

export type AnswerExplorerResult = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  prompts: RunnableTrackedPrompt[];
  models: string[];
  answers: AnswerExplorerItem[];
};

export type BrandVisibilityDetail = {
  asOf: string;
  windowDays: 7 | 30 | 90;
  period: { start: string; end: string };
  brand: { id: string; name: string; isPrimary: boolean };
  metric: {
    successfulAnswers: number;
    mentionedAnswers: number;
    mentionCount: number;
    mentionRatePct: number | null;
    sentimentEstimate: number | null;
    averagePosition: number | null;
  };
  mentionTrend: Array<{
    date: string;
    mentions: number;
    mentionedAnswers: number;
    successfulAnswers: number;
  }>;
  sentimentHistory: Array<{
    date: string;
    sentimentEstimate: number | null;
    scoredAnswers: number;
  }>;
  positionHistory: Array<{
    date: string;
    averagePosition: number | null;
    positionedAnswers: number;
  }>;
  topAnswers: Array<{
    answerId: string;
    trackedPromptId: string;
    promptSetId: string | null;
    promptText: string;
    model: string;
    modelName: string | null;
    observedAt: string;
    sentiment: "positive" | "neutral" | "negative" | null;
    position: number | null;
    excerpt: string;
  }>;
  citationOverlap: {
    mentionedAnswers: number;
    citedAnswers: number;
    overlapPct: number | null;
    domains: Array<{
      domain: string;
      answerCount: number;
      overlapPct: number | null;
    }>;
  };
};
