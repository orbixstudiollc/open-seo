import { AppError } from "@/server/lib/errors";
import { AiAnswerExplorerRepository } from "@/server/features/ai-visibility/repositories/AiAnswerExplorerRepository";
import {
  AiVisibilityAnalyticsRepository,
  type AnalyticsBrandRow,
  type AnalyticsObservationRow,
  type AnalyticsRunRow,
} from "@/server/features/ai-visibility/repositories/AiVisibilityAnalyticsRepository";
import {
  normalizeAnswers,
  parseStoredTimestamp,
} from "@/server/features/ai-visibility/services/visibilityAnalytics";
import { round1 } from "@/server/features/ai-visibility/services/visibilityAnalyticsShaping";
import type { BrandVisibilityDetail } from "@/types/schemas/ai-answer-explorer";

const DAY_MS = 24 * 60 * 60 * 1_000;

export async function getBrandVisibilityDetail(input: {
  projectId: string;
  brandId: string;
  windowDays: 7 | 30 | 90;
  asOf?: Date;
}): Promise<BrandVisibilityDetail> {
  const asOf = validDate(input.asOf ?? new Date());
  const start = new Date(asOf.getTime() - input.windowDays * DAY_MS);
  const [runs, brands] = await Promise.all([
    AiVisibilityAnalyticsRepository.getRunsWithAnswers(input.projectId),
    AiVisibilityAnalyticsRepository.getBrands(input.projectId),
  ]);
  const relevantRuns = runs.filter((run) => {
    const startedAt = parseStoredTimestamp(run.startedAt);
    return (
      startedAt != null &&
      startedAt.getTime() >= start.getTime() &&
      startedAt.getTime() < asOf.getTime()
    );
  });
  const observations = await AiVisibilityAnalyticsRepository.getObservations(
    relevantRuns.map((run) => run.id),
  );
  const brandAnswerIds = Array.from(
    new Set(
      observations
        .filter(
          (row) =>
            row.answerStatus === "success" &&
            row.mentionBrandId === input.brandId,
        )
        .map((row) => row.answerId),
    ),
  );
  const citations =
    await AiAnswerExplorerRepository.getCitations(brandAnswerIds);

  return buildBrandVisibilityDetail({
    asOf,
    windowDays: input.windowDays,
    brandId: input.brandId,
    runs: relevantRuns,
    observations,
    brands,
    citations,
  });
}

export function buildBrandVisibilityDetail(input: {
  asOf: Date;
  windowDays: 7 | 30 | 90;
  brandId: string;
  runs: AnalyticsRunRow[];
  observations: AnalyticsObservationRow[];
  brands: AnalyticsBrandRow[];
  citations: Awaited<
    ReturnType<typeof AiAnswerExplorerRepository.getCitations>
  >;
}): BrandVisibilityDetail {
  const asOf = validDate(input.asOf);
  const start = new Date(asOf.getTime() - input.windowDays * DAY_MS);
  const brand = input.brands.find(({ id }) => id === input.brandId);
  if (!brand) throw new AppError("NOT_FOUND", "Visibility brand not found");

  const answers = normalizeAnswers(input.observations).filter(
    (answer) =>
      answer.runStartedAt.getTime() >= start.getTime() &&
      answer.runStartedAt.getTime() < asOf.getTime(),
  );
  const successful = answers.filter((answer) => answer.status === "success");
  const mentioned = successful.filter((answer) =>
    answer.mentionsByBrand.has(input.brandId),
  );
  const mentionCount = mentioned.reduce(
    (total, answer) =>
      total + (answer.mentionsByBrand.get(input.brandId)?.count ?? 0),
    0,
  );
  const sentiments = mentioned.flatMap(
    (answer) =>
      answer.mentionsByBrand
        .get(input.brandId)
        ?.sentiments.map(sentimentValue) ?? [],
  );
  const positions = mentioned.flatMap(
    (answer) => answer.mentionsByBrand.get(input.brandId)?.positions ?? [],
  );
  const answersByDay = groupAnswersByDay(successful);

  return {
    asOf: asOf.toISOString(),
    windowDays: input.windowDays,
    period: { start: start.toISOString(), end: asOf.toISOString() },
    brand: { id: brand.id, name: brand.name, isPrimary: brand.isPrimary },
    metric: {
      successfulAnswers: successful.length,
      mentionedAnswers: mentioned.length,
      mentionCount,
      mentionRatePct:
        successful.length === 0
          ? null
          : round1((mentioned.length / successful.length) * 100),
      sentimentEstimate: averageOrNull(sentiments),
      averagePosition: averageOrNull(positions),
    },
    mentionTrend: Array.from(answersByDay, ([date, dayAnswers]) => {
      const dayMentioned = dayAnswers.filter((answer) =>
        answer.mentionsByBrand.has(input.brandId),
      );
      return {
        date,
        mentions: dayMentioned.reduce(
          (total, answer) =>
            total + (answer.mentionsByBrand.get(input.brandId)?.count ?? 0),
          0,
        ),
        mentionedAnswers: dayMentioned.length,
        successfulAnswers: dayAnswers.length,
      };
    }),
    sentimentHistory: Array.from(answersByDay, ([date, dayAnswers]) => {
      const values = dayAnswers.flatMap(
        (answer) =>
          answer.mentionsByBrand
            .get(input.brandId)
            ?.sentiments.map(sentimentValue) ?? [],
      );
      return {
        date,
        sentimentEstimate: averageOrNull(values),
        scoredAnswers: values.length,
      };
    }),
    positionHistory: Array.from(answersByDay, ([date, dayAnswers]) => {
      const values = dayAnswers.flatMap(
        (answer) => answer.mentionsByBrand.get(input.brandId)?.positions ?? [],
      );
      return {
        date,
        averagePosition: averageOrNull(values),
        positionedAnswers: values.length,
      };
    }),
    topAnswers: mentioned
      .toSorted(
        (a, b) =>
          b.runStartedAt.getTime() - a.runStartedAt.getTime() ||
          a.model.localeCompare(b.model),
      )
      .slice(0, 6)
      .map((answer) => {
        const observation = answer.mentionsByBrand.get(input.brandId);
        return {
          answerId: answer.id,
          trackedPromptId: answer.trackedPromptId,
          promptSetId: answer.promptSetId,
          promptText: answer.promptText,
          model: answer.model,
          modelName: answer.modelName,
          observedAt: answer.observedAt,
          sentiment: firstSentiment(observation?.sentiments ?? []),
          position: observation?.positions[0] ?? null,
          excerpt: excerpt(answer.responseText),
        };
      }),
    citationOverlap: buildCitationOverlap(
      mentioned.map((answer) => answer.id),
      input.citations,
    ),
  };
}

function groupAnswersByDay(
  answers: ReturnType<typeof normalizeAnswers>,
): Map<string, ReturnType<typeof normalizeAnswers>> {
  const byDay = new Map<string, ReturnType<typeof normalizeAnswers>>();
  for (const answer of answers) {
    const day = answer.runStartedAt.toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), answer]);
  }
  return new Map(
    Array.from(byDay.entries()).toSorted(([a], [b]) => a.localeCompare(b)),
  );
}

function buildCitationOverlap(
  answerIds: string[],
  citations: Awaited<
    ReturnType<typeof AiAnswerExplorerRepository.getCitations>
  >,
): BrandVisibilityDetail["citationOverlap"] {
  const mentionedAnswers = new Set(answerIds);
  const citedAnswers = new Set<string>();
  const answersByDomain = new Map<string, Set<string>>();
  for (const citation of citations) {
    if (!mentionedAnswers.has(citation.answerId)) continue;
    const domain = citation.domain ?? citationDomain(citation.url);
    if (!domain) continue;
    citedAnswers.add(citation.answerId);
    const domainAnswers = answersByDomain.get(domain) ?? new Set<string>();
    domainAnswers.add(citation.answerId);
    answersByDomain.set(domain, domainAnswers);
  }
  const denominator = mentionedAnswers.size;
  return {
    mentionedAnswers: denominator,
    citedAnswers: citedAnswers.size,
    overlapPct:
      denominator === 0
        ? null
        : round1((citedAnswers.size / denominator) * 100),
    domains: Array.from(answersByDomain, ([domain, ids]) => ({
      domain,
      answerCount: ids.size,
      overlapPct:
        denominator === 0 ? null : round1((ids.size / denominator) * 100),
    }))
      .toSorted(
        (a, b) =>
          b.answerCount - a.answerCount || a.domain.localeCompare(b.domain),
      )
      .slice(0, 8),
  };
}

function citationDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function excerpt(value: string | null): string {
  if (!value) return "";
  const compact = value.replace(/\s+/gu, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}…` : compact;
}

function sentimentValue(value: "positive" | "neutral" | "negative"): number {
  return value === "positive" ? 1 : value === "negative" ? -1 : 0;
}

function firstSentiment(values: Array<"positive" | "neutral" | "negative">) {
  return values[0] ?? null;
}

function averageOrNull(values: number[]): number | null {
  return values.length === 0
    ? null
    : round1(values.reduce((total, value) => total + value, 0) / values.length);
}

function validDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid brand analytics as-of timestamp");
  }
  return value;
}
