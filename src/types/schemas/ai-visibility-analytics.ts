import { z } from "zod";

export const visibilityWindowSchema = z.union([
  z.literal(7),
  z.literal(30),
  z.literal(90),
]);

export const visibilityOverviewInputSchema = z.object({
  projectId: z.string().min(1),
  windowDays: visibilityWindowSchema.default(30),
});

export const visibilityOverviewSearchSchema = z.object({
  days: z.coerce
    .number()
    .pipe(visibilityWindowSchema)
    .optional()
    .catch(undefined),
});

export type VisibilityWindow = z.infer<typeof visibilityWindowSchema>;

export type VisibilityMetric = {
  visibilityPct: number | null;
  mentionedAnswers: number;
  successfulAnswers: number;
  failedAnswers: number;
  expectedAnswers: number;
  coveragePct: number | null;
};

export type VisibilityDeltaStatus =
  | "available"
  | "not_enough_elapsed_history"
  | "no_previous_answers"
  | "cohort_changed"
  | "coverage_too_low";

export type VisibilityBreakdown = {
  key: string;
  label: string;
  detail: string | null;
  metric: VisibilityMetric;
};

export type VisibilityOverview = {
  asOf: string;
  windowDays: VisibilityWindow;
  period: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
  };
  primaryBrand: { id: string; name: string } | null;
  metric: VisibilityMetric;
  comparison: {
    status: VisibilityDeltaStatus;
    message: string;
    deltaPctPoints: number | null;
    previousVisibilityPct: number | null;
  };
  successfulModels: string[];
  trend: Array<{
    date: string;
    visibilityPct: number;
    mentionedAnswers: number;
    successfulAnswers: number;
  }>;
  platforms: VisibilityBreakdown[];
  topics: VisibilityBreakdown[];
  prompts: VisibilityBreakdown[];
  shareOfVoice: {
    platforms: string[];
    entries: Array<{
      brandId: string;
      label: string;
      isTarget: boolean;
      mentions: number;
      sharePct: number | null;
    }>;
  } | null;
};
