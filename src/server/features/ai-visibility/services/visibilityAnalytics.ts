import type {
  AnalyticsBrandRow,
  AnalyticsObservationRow,
  AnalyticsRunRow,
} from "@/server/features/ai-visibility/repositories/AiVisibilityAnalyticsRepository";
import type {
  VisibilityDeltaStatus,
  VisibilityLeaderboardSort,
  VisibilityMetric,
  VisibilityOverview,
  VisibilityWindow,
} from "@/types/schemas/ai-visibility-analytics";
import {
  buildBreakdowns,
  buildShareOfVoice,
  buildTrend,
  computeMetric,
  dedupeActiveBrands,
  round1,
  successfulModels,
  type StoredAnswer,
} from "./visibilityAnalyticsShaping";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_COMPARISON_COVERAGE = 0.8;

type ParsedRun = AnalyticsRunRow & { startedAtDate: Date };

type BuildArgs = {
  asOf: Date;
  windowDays: VisibilityWindow;
  runs: AnalyticsRunRow[];
  observations: AnalyticsObservationRow[];
  brands: AnalyticsBrandRow[];
  leaderboardSort?: VisibilityLeaderboardSort;
};

export async function getVisibilityOverview(input: {
  projectId: string;
  windowDays: VisibilityWindow;
  leaderboardSort?: VisibilityLeaderboardSort;
  asOf?: Date;
}): Promise<VisibilityOverview> {
  const { AiVisibilityAnalyticsRepository } =
    await import("@/server/features/ai-visibility/repositories/AiVisibilityAnalyticsRepository");
  const asOf = input.asOf ?? new Date();
  const runs = await AiVisibilityAnalyticsRepository.getRunsWithAnswers(
    input.projectId,
  );
  const previousStart = new Date(
    asOf.getTime() - input.windowDays * 2 * DAY_MS,
  );
  const relevantRunIds = runs
    .filter((run) => {
      const startedAt = parseStoredTimestamp(run.startedAt);
      return (
        startedAt &&
        startedAt.getTime() >= previousStart.getTime() &&
        startedAt.getTime() < asOf.getTime()
      );
    })
    .map((run) => run.id);
  const [observations, brands] = await Promise.all([
    AiVisibilityAnalyticsRepository.getObservations(relevantRunIds),
    AiVisibilityAnalyticsRepository.getBrands(input.projectId),
  ]);

  return buildVisibilityOverview({
    asOf,
    windowDays: input.windowDays,
    runs,
    observations,
    brands,
    leaderboardSort: input.leaderboardSort ?? "mentions",
  });
}

export function buildVisibilityOverview(args: BuildArgs): VisibilityOverview {
  const asOf = validDate(args.asOf);
  const currentStart = new Date(asOf.getTime() - args.windowDays * DAY_MS);
  const previousStart = new Date(asOf.getTime() - args.windowDays * 2 * DAY_MS);
  const runs = parseRuns(args.runs);
  const answers = normalizeAnswers(args.observations);
  const currentRuns = withinPeriod(runs, currentStart, asOf);
  const previousRuns = withinPeriod(runs, previousStart, currentStart);
  const currentAnswers = withinPeriod(answers, currentStart, asOf);
  const previousAnswers = withinPeriod(answers, previousStart, currentStart);
  const activeBrands = dedupeActiveBrands(args.brands);
  const primaryBrand = activeBrands.find((brand) => brand.isPrimary) ?? null;
  const primaryBrandId = primaryBrand?.id ?? null;
  const currentMetric = computeMetric(
    currentAnswers,
    primaryBrandId,
    expectedAnswers(currentRuns, currentAnswers),
  );
  const previousMetric = computeMetric(
    previousAnswers,
    primaryBrandId,
    expectedAnswers(previousRuns, previousAnswers),
  );
  const comparison = comparePeriods({
    currentMetric,
    previousMetric,
    currentAnswers,
    previousAnswers,
    primaryBrandId,
    earliestAnswerAt: earliestRunDate(runs),
    previousStart,
  });

  return {
    asOf: asOf.toISOString(),
    windowDays: args.windowDays,
    period: {
      currentStart: currentStart.toISOString(),
      currentEnd: asOf.toISOString(),
      previousStart: previousStart.toISOString(),
      previousEnd: currentStart.toISOString(),
    },
    primaryBrand: primaryBrand
      ? { id: primaryBrand.id, name: primaryBrand.name }
      : null,
    metric: currentMetric,
    comparison,
    successfulModels: successfulModels(currentAnswers),
    trend: buildTrend(currentAnswers, primaryBrandId),
    platforms: buildBreakdowns(currentAnswers, primaryBrandId, "platform"),
    topics: buildBreakdowns(currentAnswers, primaryBrandId, "topic"),
    prompts: buildBreakdowns(currentAnswers, primaryBrandId, "prompt"),
    shareOfVoice: buildShareOfVoice(
      currentAnswers,
      activeBrands,
      primaryBrand,
      args.leaderboardSort ?? "mentions",
    ),
  };
}

function parseRuns(rows: AnalyticsRunRow[]): ParsedRun[] {
  return rows.flatMap((run) => {
    const startedAtDate = parseStoredTimestamp(run.startedAt);
    return startedAtDate ? [{ ...run, startedAtDate }] : [];
  });
}

function normalizeAnswers(rows: AnalyticsObservationRow[]): StoredAnswer[] {
  const byId = new Map<string, StoredAnswer>();
  for (const row of rows) {
    const runStartedAt = parseStoredTimestamp(row.runStartedAt);
    if (!runStartedAt) continue;
    let answer = byId.get(row.answerId);
    if (!answer) {
      answer = {
        id: row.answerId,
        runId: row.runId,
        runStartedAt,
        trackedPromptId: row.trackedPromptId,
        promptText: row.promptText,
        model: row.model,
        modelName: row.modelName,
        status: row.answerStatus,
        topicId: row.topicId,
        topicName: row.topicName,
        mentionsByBrand: new Map(),
      };
      byId.set(row.answerId, answer);
    }
    if (row.mentionBrandId && row.mentionCount != null) {
      const mention = answer.mentionsByBrand.get(row.mentionBrandId) ?? {
        count: 0,
        sentiments: [],
        positions: [],
      };
      mention.count += row.mentionCount;
      if (row.mentionSentiment) {
        mention.sentiments.push(row.mentionSentiment);
      }
      if (row.mentionPosition != null) {
        mention.positions.push(row.mentionPosition);
      }
      answer.mentionsByBrand.set(row.mentionBrandId, mention);
    }
  }
  return Array.from(byId.values());
}

function expectedAnswers(runs: ParsedRun[], answers: StoredAnswer[]): number {
  const answerCountByRun = new Map<string, number>();
  for (const answer of answers) {
    answerCountByRun.set(
      answer.runId,
      (answerCountByRun.get(answer.runId) ?? 0) + 1,
    );
  }
  return runs.reduce(
    (total, run) =>
      total + Math.max(run.answersExpected, answerCountByRun.get(run.id) ?? 0),
    0,
  );
}

function comparePeriods(args: {
  currentMetric: VisibilityMetric;
  previousMetric: VisibilityMetric;
  currentAnswers: StoredAnswer[];
  previousAnswers: StoredAnswer[];
  primaryBrandId: string | null;
  earliestAnswerAt: Date | null;
  previousStart: Date;
}): VisibilityOverview["comparison"] {
  let status: VisibilityDeltaStatus = "available";
  let message = "Compared with the previous equivalent period.";

  if (args.primaryBrandId == null) {
    status = "coverage_too_low";
    message = "Set a primary brand to calculate visibility.";
  } else if (
    !args.earliestAnswerAt ||
    args.earliestAnswerAt.getTime() > args.previousStart.getTime()
  ) {
    status = "not_enough_elapsed_history";
    message = "Insufficient history for a complete previous period.";
  } else if (args.previousMetric.successfulAnswers === 0) {
    status = "no_previous_answers";
    message = "The previous period has no successful answers to compare.";
  } else if (!sameCohort(args.currentAnswers, args.previousAnswers)) {
    status = "cohort_changed";
    message = "Prompt or platform coverage changed between periods.";
  } else if (!coverageIsAdequate(args.currentMetric, args.previousMetric)) {
    status = "coverage_too_low";
    message = "Answer coverage is too low for a reliable comparison.";
  }

  const currentPct = args.currentMetric.visibilityPct;
  const previousPct = args.previousMetric.visibilityPct;
  return {
    status,
    message,
    deltaPctPoints:
      status === "available" && currentPct != null && previousPct != null
        ? round1(currentPct - previousPct)
        : null,
    previousVisibilityPct: previousPct,
  };
}

function sameCohort(
  currentAnswers: StoredAnswer[],
  previousAnswers: StoredAnswer[],
): boolean {
  const current = successfulCohort(currentAnswers);
  const previous = successfulCohort(previousAnswers);
  return (
    current.size > 0 &&
    current.size === previous.size &&
    Array.from(current).every((key) => previous.has(key))
  );
}

function successfulCohort(answers: StoredAnswer[]): Set<string> {
  return new Set(
    answers
      .filter((answer) => answer.status === "success")
      .map((answer) => `${answer.trackedPromptId}\u0000${answer.model}`),
  );
}

function coverageIsAdequate(
  current: VisibilityMetric,
  previous: VisibilityMetric,
): boolean {
  const currentCoverage = (current.coveragePct ?? 0) / 100;
  const previousCoverage = (previous.coveragePct ?? 0) / 100;
  const larger = Math.max(
    current.successfulAnswers,
    previous.successfulAnswers,
  );
  const smaller = Math.min(
    current.successfulAnswers,
    previous.successfulAnswers,
  );
  return (
    larger > 0 &&
    currentCoverage >= MIN_COMPARISON_COVERAGE &&
    previousCoverage >= MIN_COMPARISON_COVERAGE &&
    smaller / larger >= MIN_COMPARISON_COVERAGE
  );
}

function withinPeriod<T extends { startedAtDate?: Date; runStartedAt?: Date }>(
  rows: T[],
  start: Date,
  end: Date,
): T[] {
  return rows.filter((row) => {
    const date = row.startedAtDate ?? row.runStartedAt;
    return (
      date != null &&
      date.getTime() >= start.getTime() &&
      date.getTime() < end.getTime()
    );
  });
}

function earliestRunDate(runs: ParsedRun[]): Date | null {
  let earliest: Date | null = null;
  for (const run of runs) {
    if (!earliest || run.startedAtDate.getTime() < earliest.getTime()) {
      earliest = run.startedAtDate;
    }
  }
  return earliest;
}

function parseStoredTimestamp(value: string): Date | null {
  const isoLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/u.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(isoLike);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid analytics as-of timestamp");
  }
  return value;
}
