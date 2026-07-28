/* eslint-disable max-lines -- one pure shaping pipeline keeps citation, density, and gap invariants together. */
import type {
  CitationClassificationRow,
  CitationIntelligenceAnswerRow,
  CitationIntelligenceBrandRow,
  CitationIntelligenceCitationRow,
  CitationIntelligenceMentionRow,
  CitationIntelligenceRunRow,
} from "@/server/features/ai-visibility/repositories/AiCitationIntelligenceRepository";
import type {
  CitationDomainRollup,
  CitationIntelligenceOverview,
  CitationUrlRollup,
  CompetitorSourceGap,
} from "@/types/schemas/citation-intelligence";
import type { VisibilityWindow } from "@/types/schemas/ai-visibility-analytics";
import { classifyCitationDomain } from "./citationDomainClassification";
import {
  deriveBrandDomainKey,
  deriveCitationSourceKey,
  type CitationSourceKey,
} from "./citationUrl";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_ROLLUP_ROWS = 100;

type BuildCitationIntelligenceArgs = {
  asOf: Date;
  windowDays: VisibilityWindow;
  runs: CitationIntelligenceRunRow[];
  answers: CitationIntelligenceAnswerRow[];
  citations: CitationIntelligenceCitationRow[];
  mentions: CitationIntelligenceMentionRow[];
  brands: CitationIntelligenceBrandRow[];
  classifications: CitationClassificationRow[];
};

type StoredCitation = CitationSourceKey & {
  title: string | null;
};

type StoredAnswer = {
  id: string;
  runStartedAt: Date;
  status: "success" | "error";
  citations: StoredCitation[];
  mentionedBrandIds: Set<string>;
};

type DomainAggregate = {
  citations: number;
  answerIds: Set<string>;
  hostnameCounts: Map<string, number>;
};

type UrlAggregate = {
  url: string;
  title: string | null;
  domain: string;
  hostname: string;
  citations: number;
  answerIds: Set<string>;
};

export async function getCitationIntelligenceOverview(input: {
  projectId: string;
  windowDays: VisibilityWindow;
  asOf?: Date;
}): Promise<CitationIntelligenceOverview> {
  const { AiCitationIntelligenceRepository } =
    await import("@/server/features/ai-visibility/repositories/AiCitationIntelligenceRepository");
  const asOf = input.asOf ?? new Date();
  const previousStart = new Date(
    asOf.getTime() - input.windowDays * 2 * DAY_MS,
  );
  const [runs, brands, classifications] = await Promise.all([
    AiCitationIntelligenceRepository.getRunsWithAnswers(input.projectId),
    AiCitationIntelligenceRepository.getBrands(input.projectId),
    AiCitationIntelligenceRepository.getClassifications(input.projectId),
  ]);
  const relevantRunIds = runs
    .filter((run) =>
      isWithin(parseStoredTimestamp(run.startedAt), previousStart, asOf),
    )
    .map((run) => run.id);
  const answers =
    await AiCitationIntelligenceRepository.getAnswers(relevantRunIds);
  const answerIds = answers.map((answer) => answer.id);
  const [citations, mentions] = await Promise.all([
    AiCitationIntelligenceRepository.getCitations(answerIds),
    AiCitationIntelligenceRepository.getMentions(answerIds),
  ]);

  return buildCitationIntelligenceOverview({
    asOf,
    windowDays: input.windowDays,
    runs,
    answers,
    citations,
    mentions,
    brands,
    classifications,
  });
}

export function buildCitationIntelligenceOverview(
  args: BuildCitationIntelligenceArgs,
): CitationIntelligenceOverview {
  const asOf = validDate(args.asOf);
  const currentStart = new Date(asOf.getTime() - args.windowDays * DAY_MS);
  const previousStart = new Date(asOf.getTime() - args.windowDays * 2 * DAY_MS);
  const activeBrands = dedupeActiveBrands(args.brands);
  const primaryBrand = activeBrands.find((brand) => brand.isPrimary) ?? null;
  const competitors = activeBrands.filter((brand) => !brand.isPrimary);
  const trackedBrandDomains = new Set(
    activeBrands.flatMap((brand) => {
      const domain = deriveBrandDomainKey(brand.domain);
      return domain ? [domain] : [];
    }),
  );
  const currentAnswers = normalizeAnswers(args)
    .filter((answer) => isWithin(answer.runStartedAt, currentStart, asOf))
    .filter((answer) => answer.status === "success");
  const domainAggregates = aggregateDomains(currentAnswers);
  const classificationByDomain = new Map(
    [...domainAggregates.entries()].map(([domain, aggregate]) => [
      domain,
      classifyCitationDomain({
        domain,
        hostnames: sortedHostnames(aggregate.hostnameCounts),
        classifications: args.classifications,
        trackedBrandDomains,
      }),
    ]),
  );

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
    metric: buildDensityMetric(currentAnswers, domainAggregates),
    trend: buildCitationTrend(currentAnswers),
    domains: buildDomainRollups(
      domainAggregates,
      currentAnswers.length,
      classificationByDomain,
    ),
    urls: buildUrlRollups(currentAnswers),
    gapReport: buildGapReport({
      answers: currentAnswers,
      domains: domainAggregates,
      classifications: classificationByDomain,
      primaryBrand,
      competitors,
      windowDays: args.windowDays,
    }),
    classificationNote:
      "Domain-level labels use reviewed project overrides, a maintained versioned list, tracked brand domains, and narrow government/academic heuristics. Unmatched domains stay unclassified.",
  };
}

function normalizeAnswers(args: BuildCitationIntelligenceArgs): StoredAnswer[] {
  const citationsByAnswer = new Map<string, StoredCitation[]>();
  for (const row of args.citations) {
    const source = deriveCitationSourceKey(row.url);
    if (!source) continue;
    const rows = citationsByAnswer.get(row.answerId) ?? [];
    rows.push({ ...source, title: row.title });
    citationsByAnswer.set(row.answerId, rows);
  }
  const mentionsByAnswer = new Map<string, Set<string>>();
  for (const row of args.mentions) {
    if (!row.brandId || row.mentionCount <= 0) continue;
    const brandIds = mentionsByAnswer.get(row.answerId) ?? new Set<string>();
    brandIds.add(row.brandId);
    mentionsByAnswer.set(row.answerId, brandIds);
  }
  return args.answers.flatMap((row) => {
    const runStartedAt = parseStoredTimestamp(row.runStartedAt);
    return runStartedAt
      ? [
          {
            id: row.id,
            runStartedAt,
            status: row.status,
            citations: citationsByAnswer.get(row.id) ?? [],
            mentionedBrandIds:
              mentionsByAnswer.get(row.id) ?? new Set<string>(),
          },
        ]
      : [];
  });
}

function aggregateDomains(
  answers: StoredAnswer[],
): Map<string, DomainAggregate> {
  const aggregates = new Map<string, DomainAggregate>();
  for (const answer of answers) {
    for (const citation of answer.citations) {
      const aggregate = aggregates.get(citation.domain) ?? {
        citations: 0,
        answerIds: new Set<string>(),
        hostnameCounts: new Map<string, number>(),
      };
      aggregate.citations += 1;
      aggregate.answerIds.add(answer.id);
      aggregate.hostnameCounts.set(
        citation.hostname,
        (aggregate.hostnameCounts.get(citation.hostname) ?? 0) + 1,
      );
      aggregates.set(citation.domain, aggregate);
    }
  }
  return aggregates;
}

function buildDensityMetric(
  answers: StoredAnswer[],
  domains: Map<string, DomainAggregate>,
): CitationIntelligenceOverview["metric"] {
  const citations = answers.reduce(
    (total, answer) => total + answer.citations.length,
    0,
  );
  const citedAnswers = answers.filter(
    (answer) => answer.citations.length > 0,
  ).length;
  return {
    citations,
    citedAnswers,
    successfulAnswers: answers.length,
    uniqueDomains: domains.size,
    uniqueUrls: new Set(
      answers.flatMap((answer) =>
        answer.citations.map((citation) => citation.url),
      ),
    ).size,
    avgCitationsPerAnswer:
      answers.length === 0 ? null : round2(citations / answers.length),
    citedAnswerPct:
      answers.length === 0
        ? null
        : round1((citedAnswers / answers.length) * 100),
  };
}

function buildCitationTrend(
  answers: StoredAnswer[],
): CitationIntelligenceOverview["trend"] {
  const byDay = new Map<string, StoredAnswer[]>();
  for (const answer of answers) {
    const date = answer.runStartedAt.toISOString().slice(0, 10);
    byDay.set(date, [...(byDay.get(date) ?? []), answer]);
  }
  return [...byDay.entries()]
    .map(([date, dayAnswers]) => {
      const citations = dayAnswers.reduce(
        (total, answer) => total + answer.citations.length,
        0,
      );
      return {
        date,
        citations,
        citedAnswers: dayAnswers.filter((answer) => answer.citations.length > 0)
          .length,
        successfulAnswers: dayAnswers.length,
        avgCitationsPerAnswer: round2(citations / dayAnswers.length),
      };
    })
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

function buildDomainRollups(
  aggregates: Map<string, DomainAggregate>,
  successfulAnswers: number,
  classifications: Map<string, CitationDomainRollup["classification"]>,
): CitationDomainRollup[] {
  return [...aggregates.entries()]
    .map(([domain, aggregate]) => ({
      domain,
      hostnames: sortedHostnames(aggregate.hostnameCounts),
      classification: classifications.get(domain) ?? {
        domainType: "unknown" as const,
        method: "unclassified" as const,
        matchScope: null,
        ruleVersion: null,
        confidence: null,
      },
      citations: aggregate.citations,
      citingAnswers: aggregate.answerIds.size,
      avgCitationsPerAnswer:
        successfulAnswers === 0
          ? 0
          : round2(aggregate.citations / successfulAnswers),
    }))
    .toSorted(
      (a, b) =>
        b.citations - a.citations ||
        b.citingAnswers - a.citingAnswers ||
        a.domain.localeCompare(b.domain),
    )
    .slice(0, MAX_ROLLUP_ROWS);
}

function buildUrlRollups(answers: StoredAnswer[]): CitationUrlRollup[] {
  const aggregates = new Map<string, UrlAggregate>();
  for (const answer of answers) {
    for (const citation of answer.citations) {
      const aggregate = aggregates.get(citation.url) ?? {
        url: citation.url,
        title: citation.title,
        domain: citation.domain,
        hostname: citation.hostname,
        citations: 0,
        answerIds: new Set<string>(),
      };
      aggregate.citations += 1;
      aggregate.answerIds.add(answer.id);
      if (!aggregate.title && citation.title) aggregate.title = citation.title;
      aggregates.set(citation.url, aggregate);
    }
  }
  return [...aggregates.values()]
    .map((aggregate) => ({
      url: aggregate.url,
      title: aggregate.title,
      domain: aggregate.domain,
      hostname: aggregate.hostname,
      citations: aggregate.citations,
      citingAnswers: aggregate.answerIds.size,
      avgCitationsPerAnswer:
        answers.length === 0 ? 0 : round2(aggregate.citations / answers.length),
    }))
    .toSorted(
      (a, b) =>
        b.citations - a.citations ||
        b.citingAnswers - a.citingAnswers ||
        a.url.localeCompare(b.url),
    )
    .slice(0, MAX_ROLLUP_ROWS);
}

function buildGapReport(args: {
  answers: StoredAnswer[];
  domains: Map<string, DomainAggregate>;
  classifications: Map<string, CitationDomainRollup["classification"]>;
  primaryBrand: CitationIntelligenceBrandRow | null;
  competitors: CitationIntelligenceBrandRow[];
  windowDays: VisibilityWindow;
}): CitationIntelligenceOverview["gapReport"] {
  const competitorById = new Map(
    args.competitors.map((brand) => [brand.id, brand]),
  );
  const primaryCitedDomains = new Set<string>();
  const candidates = new Map<
    string,
    {
      answerIds: Set<string>;
      brandIds: Set<string>;
      citations: number;
    }
  >();

  for (const answer of args.answers) {
    const citationsByDomain = new Map<string, number>();
    for (const citation of answer.citations) {
      citationsByDomain.set(
        citation.domain,
        (citationsByDomain.get(citation.domain) ?? 0) + 1,
      );
    }
    if (
      args.primaryBrand &&
      answer.mentionedBrandIds.has(args.primaryBrand.id)
    ) {
      for (const domain of citationsByDomain.keys()) {
        primaryCitedDomains.add(domain);
      }
    }
    const competitorIds = [...answer.mentionedBrandIds].filter((brandId) =>
      competitorById.has(brandId),
    );
    if (competitorIds.length === 0) continue;
    for (const [domain, citationCount] of citationsByDomain) {
      const candidate = candidates.get(domain) ?? {
        answerIds: new Set<string>(),
        brandIds: new Set<string>(),
        citations: 0,
      };
      candidate.answerIds.add(answer.id);
      for (const brandId of competitorIds) candidate.brandIds.add(brandId);
      candidate.citations += citationCount;
      candidates.set(domain, candidate);
    }
  }

  const rankedEntries: CompetitorSourceGap[] = [...candidates.entries()]
    .filter(([domain]) => !primaryCitedDomains.has(domain))
    .map(([domain, candidate]) => ({
      domain,
      classification: args.classifications.get(domain) ?? {
        domainType: "unknown",
        method: "unclassified",
        matchScope: null,
        ruleVersion: null,
        confidence: null,
      },
      competitorBrands: [...candidate.brandIds]
        .flatMap((brandId) => {
          const brand = competitorById.get(brandId);
          return brand ? [{ id: brand.id, name: brand.name }] : [];
        })
        .toSorted((a, b) => a.name.localeCompare(b.name)),
      competitorMentionedAnswers: candidate.answerIds.size,
      citationsInCompetitorAnswers: candidate.citations,
      totalCitations:
        args.domains.get(domain)?.citations ?? candidate.citations,
    }))
    .toSorted(
      (a, b) =>
        b.competitorMentionedAnswers - a.competitorMentionedAnswers ||
        b.citationsInCompetitorAnswers - a.citationsInCompetitorAnswers ||
        b.totalCitations - a.totalCitations ||
        a.domain.localeCompare(b.domain),
    );
  const entries = rankedEntries.slice(0, MAX_ROLLUP_ROWS);

  return {
    trackedCompetitors: args.competitors.length,
    totalDomains: args.primaryBrand ? rankedEntries.length : 0,
    truncated: rankedEntries.length > entries.length,
    scopeNote: args.primaryBrand
      ? `Domains cited in competitor-mentioned answers with zero ${args.primaryBrand.name}-mentioned cited answers in this stored ${args.windowDays}-day window.`
      : "Set a primary brand to calculate competitor-source gaps.",
    entries: args.primaryBrand ? entries : [],
  };
}

function dedupeActiveBrands(
  rows: CitationIntelligenceBrandRow[],
): CitationIntelligenceBrandRow[] {
  const primary = rows.find((brand) => brand.isPrimary && !brand.archivedAt);
  const seen = new Set<string>();
  const result: CitationIntelligenceBrandRow[] = [];
  if (primary) {
    seen.add(primary.normalizedName.toLowerCase());
    result.push(primary);
  }
  for (const brand of rows) {
    if (brand.archivedAt || brand.id === primary?.id) continue;
    const key = brand.normalizedName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(brand);
  }
  return result;
}

function sortedHostnames(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .toSorted(
      ([hostA, countA], [hostB, countB]) =>
        countB - countA || hostA.localeCompare(hostB),
    )
    .map(([hostname]) => hostname);
}

function parseStoredTimestamp(value: string): Date | null {
  const normalized = /[tT]/u.test(value)
    ? value
    : value.replace(" ", "T") + (/[zZ]$/u.test(value) ? "" : "Z");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError("asOf must be a valid date");
  }
  return value;
}

function isWithin(value: Date | null, start: Date, end: Date): value is Date {
  return (
    value != null &&
    value.getTime() >= start.getTime() &&
    value.getTime() < end.getTime()
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
