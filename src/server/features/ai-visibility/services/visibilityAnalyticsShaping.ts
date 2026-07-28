import { sortBy } from "remeda";
import { formatAiModelLabel } from "@/shared/aiVisibilityLabels";
import type { AnalyticsBrandRow } from "@/server/features/ai-visibility/repositories/AiVisibilityAnalyticsRepository";
import type {
  VisibilityBreakdown,
  VisibilityMetric,
  VisibilityOverview,
} from "@/types/schemas/ai-visibility-analytics";

export type StoredAnswer = {
  id: string;
  runId: string;
  runStartedAt: Date;
  trackedPromptId: string;
  promptText: string;
  model: string;
  modelName: string | null;
  status: "success" | "error";
  topicId: string | null;
  topicName: string | null;
  mentionsByBrand: Map<string, number>;
};

export function computeMetric(
  answers: StoredAnswer[],
  primaryBrandId: string | null,
  expected: number,
): VisibilityMetric {
  const successful = answers.filter((answer) => answer.status === "success");
  const mentioned =
    primaryBrandId == null
      ? 0
      : successful.filter(
          (answer) => (answer.mentionsByBrand.get(primaryBrandId) ?? 0) > 0,
        ).length;
  const successfulCount = successful.length;
  return {
    visibilityPct:
      primaryBrandId == null || successfulCount === 0
        ? null
        : round1((mentioned / successfulCount) * 100),
    mentionedAnswers: mentioned,
    successfulAnswers: successfulCount,
    failedAnswers: answers.length - successfulCount,
    expectedAnswers: expected,
    coveragePct:
      expected === 0 ? null : round1((successfulCount / expected) * 100),
  };
}

export function buildTrend(
  answers: StoredAnswer[],
  primaryBrandId: string | null,
): VisibilityOverview["trend"] {
  const byDay = new Map<string, StoredAnswer[]>();
  for (const answer of answers) {
    if (answer.status !== "success") continue;
    const day = answer.runStartedAt.toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), answer]);
  }
  return sortBy(
    Array.from(byDay.entries()).flatMap(([date, dayAnswers]) => {
      const metric = computeMetric(
        dayAnswers,
        primaryBrandId,
        dayAnswers.length,
      );
      return metric.visibilityPct == null
        ? []
        : [
            {
              date,
              visibilityPct: metric.visibilityPct,
              mentionedAnswers: metric.mentionedAnswers,
              successfulAnswers: metric.successfulAnswers,
            },
          ];
    }),
    [(point) => point.date, "asc"],
  );
}

type BreakdownKind = "platform" | "topic" | "prompt";

export function buildBreakdowns(
  answers: StoredAnswer[],
  primaryBrandId: string | null,
  kind: BreakdownKind,
): VisibilityBreakdown[] {
  const groups = new Map<
    string,
    { label: string; detail: string | null; answers: StoredAnswer[] }
  >();
  for (const answer of answers) {
    const descriptor = breakdownDescriptor(answer, kind);
    const group = groups.get(descriptor.key) ?? {
      label: descriptor.label,
      detail: descriptor.detail,
      answers: [],
    };
    group.answers.push(answer);
    groups.set(descriptor.key, group);
  }
  return sortBy(
    Array.from(groups.entries()).map(([key, group]) => ({
      key,
      label: group.label,
      detail: group.detail,
      metric: computeMetric(
        group.answers,
        primaryBrandId,
        group.answers.length,
      ),
    })),
    [(row) => row.metric.visibilityPct ?? -1, "desc"],
    [(row) => row.metric.successfulAnswers, "desc"],
    [(row) => row.label, "asc"],
  );
}

export function buildShareOfVoice(
  answers: StoredAnswer[],
  brands: AnalyticsBrandRow[],
  primaryBrand: AnalyticsBrandRow | null,
): VisibilityOverview["shareOfVoice"] {
  if (!primaryBrand || brands.length < 2) return null;
  const successful = answers.filter((answer) => answer.status === "success");
  if (successful.length === 0) return null;

  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const mentions = new Map(brands.map((brand) => [brand.id, 0]));
  for (const answer of successful) {
    for (const [brandId, count] of answer.mentionsByBrand) {
      if (brandById.has(brandId)) {
        mentions.set(brandId, (mentions.get(brandId) ?? 0) + count);
      }
    }
  }
  const denominator = Array.from(mentions.values()).reduce(
    (total, count) => total + count,
    0,
  );
  const entries = sortBy(
    brands.map((brand) => {
      const count = mentions.get(brand.id) ?? 0;
      return {
        brandId: brand.id,
        label: brand.name,
        isTarget: brand.id === primaryBrand.id,
        mentions: count,
        sharePct:
          denominator === 0 ? null : round1((count / denominator) * 100),
      };
    }),
    [(entry) => entry.mentions, "desc"],
    [(entry) => entry.label, "asc"],
  );
  return {
    platforms: successfulModels(successful),
    entries,
  };
}

export function dedupeActiveBrands(
  rows: AnalyticsBrandRow[],
): AnalyticsBrandRow[] {
  const target = rows.find((brand) => brand.isPrimary && !brand.archivedAt);
  const seen = new Set<string>();
  if (target) seen.add(target.normalizedName.toLowerCase());
  const result = target ? [target] : [];
  for (const brand of rows) {
    if (brand.archivedAt || brand.id === target?.id) continue;
    const key = brand.normalizedName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(brand);
  }
  return result;
}

export function successfulModels(answers: StoredAnswer[]): string[] {
  return sortBy(
    Array.from(
      new Set(
        answers
          .filter((answer) => answer.status === "success")
          .map((answer) => answer.model),
      ),
    ),
    [(model) => model, "asc"],
  );
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function breakdownDescriptor(answer: StoredAnswer, kind: BreakdownKind) {
  if (kind === "platform") {
    return {
      key: answer.model,
      label: formatAiModelLabel(answer.model),
      detail: answer.modelName,
    };
  }
  if (kind === "topic") {
    return {
      key: answer.topicId ?? "uncategorized",
      label: answer.topicName ?? "Uncategorized",
      detail: null,
    };
  }
  return {
    key: answer.trackedPromptId,
    label: answer.promptText,
    detail: answer.topicName ?? "Uncategorized",
  };
}
