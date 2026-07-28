/* eslint-disable max-lines -- generation, validation, and score explanations stay together for auditability. */
import { z } from "zod";
import {
  AUDIT_ISSUE_TYPES,
  type AuditIssueType,
  type IssueSeverity,
} from "@/shared/audit-issues";
import type { CitationRecommendationGap } from "@/types/schemas/citation-intelligence";
import type {
  RecommendationCategory,
  RecommendationPriorityLevel,
  RecommendationScoreFactor,
} from "@/types/schemas/recommendations";

const RECOMMENDATION_GENERATOR_VERSION = "recommendations-v1";
const RECOMMENDATION_SCORE_VERSION = "priority-v1";

export type AuditRecommendationFinding = {
  id: string;
  auditId: string;
  pageId: string | null;
  pageUrl: string;
  issueType: string;
  severity: IssueSeverity;
  detailsJson: string | null;
  crawlDepth: number | null;
  inSitemap: boolean | null;
};

export type AuditRecommendationSource = {
  audit: {
    id: string;
    startUrl: string;
    completedAt: string | null;
  };
  findings: AuditRecommendationFinding[];
};

export type RecommendationCandidate = {
  category: RecommendationCategory;
  ruleKey: string;
  generatorVersion: string;
  fingerprint: string;
  targetKind: "site_page" | "external_url";
  targetUrl: string;
  targetHostname: string | null;
  targetLabel: string;
  targetCommunity: string | null;
  title: string;
  action: string;
  rationale: string;
  priorityLevel: RecommendationPriorityLevel;
  priorityScore: number;
  scoreVersion: string;
  evidenceWindowStart: string | null;
  evidenceWindowEnd: string | null;
  evidenceAsOf: string;
  occurrenceCount: number;
  affectedPageCount: number;
  citationCount: number;
  answerCount: number;
  promptCount: number;
  targetBrandCitationCount: number;
  competitorCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  scoreFactors: RecommendationScoreFactor[];
  auditEvidence: Array<{
    evidenceFingerprint: string;
    auditIssueId: string;
    sourceAuditId: string;
    issueType: string;
    severity: IssueSeverity;
    pageUrl: string;
    detailsJson: string | null;
  }>;
  citationEvidence: CitationRecommendationGap["evidence"];
};

const optionalStatus = z.number().int().nullable();
const nonNegativeInt = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();
const nullableString = z.string().nullable();
const url = z.string().url();
const emptyDetails = z.object({}).passthrough();
const brokenInternalLinkDetails = z.object({
  targetUrl: url,
  targetStatus: optionalStatus,
});

const AUDIT_DETAILS_SCHEMAS: Record<AuditIssueType, z.ZodType> = {
  "blocked-page": z.object({ statusCode: optionalStatus }),
  "server-error": z.object({ statusCode: nonNegativeInt }),
  "broken-internal-link": brokenInternalLinkDetails,
  "missing-title": emptyDetails,
  "broken-page": z.object({ statusCode: nonNegativeInt }),
  "duplicate-title": z.object({
    groupSize: positiveInt,
    otherUrls: z.array(url),
  }),
  "duplicate-meta-description": z.object({
    groupSize: positiveInt,
    otherUrls: z.array(url),
  }),
  "duplicate-content": z.object({
    groupSize: positiveInt,
    otherUrls: z.array(url),
  }),
  "missing-meta-description": emptyDetails,
  "missing-h1": emptyDetails,
  "multiple-h1": z.object({ h1Count: positiveInt }),
  "redirect-chain": z.object({
    hops: z.array(url).min(2),
    finalUrl: url,
  }),
  "redirect-loop": z.object({ hops: z.array(url).min(2) }),
  "canonical-conflict": z.object({
    htmlCanonical: z.string().min(1),
    headerCanonical: z.string().min(1),
  }),
  "thin-content": z.object({ wordCount: nonNegativeInt }),
  "images-missing-alt": z.object({
    imagesMissingAlt: positiveInt,
    imagesTotal: nonNegativeInt,
  }),
  "orphan-page": emptyDetails,
  "no-outgoing-links": emptyDetails,
  "title-too-long": z.object({ length: positiveInt }),
  "title-too-short": z.object({ length: nonNegativeInt }),
  "meta-description-too-long": z.object({ length: positiveInt }),
  "meta-description-too-short": z.object({ length: nonNegativeInt }),
  "heading-order-skip": emptyDetails,
  "slow-response": z.object({ responseTimeMs: nonNegativeInt }),
  "noindex-page": z.object({
    robotsMeta: nullableString,
    xRobotsTag: nullableString,
  }),
  "canonicalized-page": z.object({ canonicalUrl: z.string().min(1) }),
  "deep-page": z.object({ crawlDepth: nonNegativeInt }),
};

const RULES_REQUIRING_DETAILS = new Set<AuditIssueType>([
  "blocked-page",
  "server-error",
  "broken-internal-link",
  "broken-page",
  "duplicate-title",
  "duplicate-meta-description",
  "duplicate-content",
  "multiple-h1",
  "redirect-chain",
  "redirect-loop",
  "canonical-conflict",
  "thin-content",
  "images-missing-alt",
  "title-too-long",
  "title-too-short",
  "meta-description-too-long",
  "meta-description-too-short",
  "slow-response",
  "noindex-page",
  "canonicalized-page",
  "deep-page",
]);

export function buildRecommendationCandidates(input: {
  generatedAt: Date;
  auditSource: AuditRecommendationSource | null;
  citationGaps: CitationRecommendationGap[];
}): RecommendationCandidate[] {
  const generatedAt = validDate(input.generatedAt);
  return [
    ...buildAuditCandidates(input.auditSource, generatedAt),
    ...input.citationGaps.map((gap) => buildOffPageCandidate(gap, generatedAt)),
  ].toSorted(
    (a, b) =>
      b.priorityScore - a.priorityScore ||
      a.category.localeCompare(b.category) ||
      a.targetLabel.localeCompare(b.targetLabel),
  );
}

function buildAuditCandidates(
  source: AuditRecommendationSource | null,
  generatedAt: Date,
): RecommendationCandidate[] {
  if (!source?.audit.completedAt) return [];
  const completedAt = parseDate(source.audit.completedAt);
  if (!completedAt) return [];
  const grouped = new Map<
    string,
    {
      issueType: AuditIssueType;
      details: unknown;
      findings: AuditRecommendationFinding[];
    }
  >();

  for (const finding of source.findings) {
    if (!isAuditIssueType(finding.issueType)) continue;
    const details = parseAuditDetails(finding.issueType, finding.detailsJson);
    if (!details.valid) continue;
    const fingerprint = auditFingerprint(
      finding.issueType,
      finding.pageUrl,
      details.value,
    );
    if (!fingerprint) continue;
    const current = grouped.get(fingerprint);
    if (current) {
      current.findings.push(finding);
    } else {
      grouped.set(fingerprint, {
        issueType: finding.issueType,
        details: details.value,
        findings: [finding],
      });
    }
  }

  return [...grouped.entries()].map(
    ([fingerprint, { issueType, details, findings }]) => {
      const descriptor = AUDIT_ISSUE_TYPES[issueType];
      const affectedPages = new Set(findings.map((finding) => finding.pageUrl));
      const factors = auditScoreFactors({
        severity: descriptor.severity,
        findings,
        startUrl: source.audit.startUrl,
        completedAt,
        generatedAt,
      });
      const score = scoreFrom(factors);
      const targetUrl = findings[0].pageUrl;
      const targetLabel = auditTargetLabel(issueType, targetUrl, details);
      return {
        category: descriptor.recommendationCategory,
        ruleKey: `site_audit:${issueType}`,
        generatorVersion: RECOMMENDATION_GENERATOR_VERSION,
        fingerprint,
        targetKind: "site_page" as const,
        targetUrl,
        targetHostname: hostname(targetUrl),
        targetLabel,
        targetCommunity: null,
        title: descriptor.title,
        action: descriptor.howToFix,
        rationale: `${descriptor.explanation} The completed Site Audit found ${findings.length} occurrence${findings.length === 1 ? "" : "s"} affecting ${affectedPages.size} page${affectedPages.size === 1 ? "" : "s"}, including ${targetUrl}.`,
        priorityLevel: priorityLevel(score),
        priorityScore: score,
        scoreVersion: RECOMMENDATION_SCORE_VERSION,
        evidenceWindowStart: null,
        evidenceWindowEnd: completedAt.toISOString(),
        evidenceAsOf: completedAt.toISOString(),
        occurrenceCount: findings.length,
        affectedPageCount: affectedPages.size,
        citationCount: 0,
        answerCount: 0,
        promptCount: 0,
        targetBrandCitationCount: 0,
        competitorCount: 0,
        firstObservedAt: null,
        lastObservedAt: null,
        scoreFactors: factors,
        auditEvidence: findings.map((finding) => ({
          evidenceFingerprint: finding.id,
          auditIssueId: finding.id,
          sourceAuditId: finding.auditId,
          issueType: finding.issueType,
          severity: finding.severity,
          pageUrl: finding.pageUrl,
          detailsJson: finding.detailsJson,
        })),
        citationEvidence: [],
      };
    },
  );
}

function buildOffPageCandidate(
  gap: CitationRecommendationGap,
  generatedAt: Date,
): RecommendationCandidate {
  const factors = offPageScoreFactors(gap, generatedAt);
  const score = scoreFrom(factors);
  const competitors = gap.competitorBrands
    .map((brand) => brand.name)
    .join(", ");
  const destination = gap.targetCommunity ?? gap.targetHostname;
  const title = gap.targetTitle
    ? `Earn a relevant mention on “${gap.targetTitle}”`
    : `Earn a relevant mention on ${destination}`;

  return {
    category: "off_page",
    ruleKey: "citation_gap:exact_url",
    generatorVersion: RECOMMENDATION_GENERATOR_VERSION,
    fingerprint: `off_page:citation_gap:${gap.targetUrl}`,
    targetKind: "external_url",
    targetUrl: gap.targetUrl,
    targetHostname: gap.targetHostname,
    targetLabel: gap.targetTitle ?? gap.targetCommunity ?? gap.targetUrl,
    targetCommunity: gap.targetCommunity,
    title,
    action: offPageAction(gap),
    rationale: `${gap.targetUrl} was cited ${gap.citationCount} time${gap.citationCount === 1 ? "" : "s"} across ${gap.answerCount} competitor-mentioned answer${gap.answerCount === 1 ? "" : "s"} and ${gap.promptCount} tracked prompt${gap.promptCount === 1 ? "" : "s"}, alongside ${competitors}. The primary brand had zero cited answers for ${gap.targetDomain} in the same stored window. This is answer-level co-occurrence, not proof that the page supports a specific claim.`,
    priorityLevel: priorityLevel(score),
    priorityScore: score,
    scoreVersion: RECOMMENDATION_SCORE_VERSION,
    evidenceWindowStart: gap.evidenceWindowStart,
    evidenceWindowEnd: gap.evidenceWindowEnd,
    evidenceAsOf: gap.evidenceWindowEnd,
    occurrenceCount: 0,
    affectedPageCount: 0,
    citationCount: gap.citationCount,
    answerCount: gap.answerCount,
    promptCount: gap.promptCount,
    targetBrandCitationCount: gap.targetBrandCitationCount,
    competitorCount: gap.competitorBrands.length,
    firstObservedAt: gap.firstObservedAt,
    lastObservedAt: gap.lastObservedAt,
    scoreFactors: factors,
    auditEvidence: [],
    citationEvidence: gap.evidence,
  };
}

function parseAuditDetails(
  issueType: AuditIssueType,
  detailsJson: string | null,
): { valid: true; value: unknown } | { valid: false } {
  let value: unknown = {};
  if (detailsJson) {
    try {
      value = JSON.parse(detailsJson);
    } catch {
      return { valid: false };
    }
  } else if (RULES_REQUIRING_DETAILS.has(issueType)) {
    return { valid: false };
  }
  const result = AUDIT_DETAILS_SCHEMAS[issueType].safeParse(value);
  return result.success
    ? { valid: true, value: result.data }
    : { valid: false };
}

function auditFingerprint(
  issueType: AuditIssueType,
  pageUrl: string,
  details: unknown,
): string | null {
  if (issueType === "broken-internal-link") {
    const parsed = brokenInternalLinkDetails.safeParse(details);
    if (!parsed.success) return null;
    const targetUrl = parsed.data.targetUrl;
    return `site_audit:${issueType}:${pageUrl}:${targetUrl}`;
  }
  return `site_audit:${issueType}:${pageUrl}`;
}

function auditTargetLabel(
  issueType: AuditIssueType,
  pageUrl: string,
  details: unknown,
): string {
  if (issueType !== "broken-internal-link") return pageUrl;
  const parsed = brokenInternalLinkDetails.safeParse(details);
  if (!parsed.success) return pageUrl;
  return `${pageUrl} → ${parsed.data.targetUrl}`;
}

function auditScoreFactors(input: {
  severity: IssueSeverity;
  findings: AuditRecommendationFinding[];
  startUrl: string;
  completedAt: Date;
  generatedAt: Date;
}): RecommendationScoreFactor[] {
  const severityRaw = { critical: 1, warning: 2 / 3, info: 1 / 3 }[
    input.severity
  ];
  const importanceRaw = Math.max(
    ...input.findings.map((finding) =>
      targetImportance(finding, input.startUrl),
    ),
  );
  const affectedPages = new Set(
    input.findings.map((finding) => finding.pageUrl),
  ).size;
  const scopeRaw = Math.min(
    1,
    Math.max(input.findings.length / 10, affectedPages / 5),
  );
  const ageDays = Math.max(
    0,
    (input.generatedAt.getTime() - input.completedAt.getTime()) /
      (24 * 60 * 60 * 1_000),
  );
  const recencyRaw = Math.max(0, 1 - ageDays / 90);
  return [
    factor(
      "severity",
      "Audit severity",
      severityRaw,
      45,
      `${input.severity} Site Audit severity`,
    ),
    factor(
      "target_importance",
      "Target importance",
      importanceRaw,
      25,
      "Derived from start-page proximity, crawl depth, and sitemap presence",
    ),
    factor(
      "affected_scope",
      "Affected scope",
      scopeRaw,
      10,
      `${input.findings.length} occurrence${input.findings.length === 1 ? "" : "s"} across ${affectedPages} page${affectedPages === 1 ? "" : "s"}`,
    ),
    factor(
      "audit_recency",
      "Audit recency",
      recencyRaw,
      20,
      `Completed ${formatDays(ageDays)} ago; contribution decays over 90 days`,
    ),
  ];
}

function offPageScoreFactors(
  gap: CitationRecommendationGap,
  generatedAt: Date,
): RecommendationScoreFactor[] {
  const lastObserved = parseDate(gap.lastObservedAt) ?? generatedAt;
  const ageDays = Math.max(
    0,
    (generatedAt.getTime() - lastObserved.getTime()) / (24 * 60 * 60 * 1_000),
  );
  return [
    factor(
      "citation_volume",
      "Citation volume",
      Math.min(1, gap.citationCount / 20),
      35,
      `${gap.citationCount} exact-page citation${gap.citationCount === 1 ? "" : "s"}; full contribution at 20`,
    ),
    factor(
      "answer_reach",
      "Answer reach",
      Math.min(1, gap.answerCount / 10),
      25,
      `${gap.answerCount} distinct competitor-mentioned answer${gap.answerCount === 1 ? "" : "s"}; full contribution at 10`,
    ),
    factor(
      "competitor_breadth",
      "Competitor breadth",
      Math.min(1, gap.competitorBrands.length / 4),
      20,
      `${gap.competitorBrands.length} resolved competitor${gap.competitorBrands.length === 1 ? "" : "s"}; full contribution at 4`,
    ),
    factor(
      "observation_recency",
      "Observation recency",
      Math.max(0, 1 - ageDays / 90),
      20,
      `Last observed ${formatDays(ageDays)} ago; contribution decays over 90 days`,
    ),
  ];
}

function targetImportance(
  finding: AuditRecommendationFinding,
  startUrl: string,
): number {
  if (finding.pageUrl === startUrl || finding.crawlDepth === 0) return 1;
  let raw =
    finding.crawlDepth == null
      ? 0.35
      : finding.crawlDepth <= 1
        ? 0.85
        : finding.crawlDepth <= 3
          ? 0.6
          : 0.3;
  if (finding.inSitemap) raw += 0.1;
  return Math.min(1, raw);
}

function factor(
  factorKey: string,
  label: string,
  rawValue: number,
  weight: number,
  explanation: string,
): RecommendationScoreFactor {
  return {
    factorKey,
    label,
    rawValue: round2(rawValue),
    weight,
    contribution: round2(rawValue * weight),
    explanation,
  };
}

function scoreFrom(factors: RecommendationScoreFactor[]): number {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        factors.reduce((total, scoreFactor) => {
          return total + scoreFactor.contribution;
        }, 0),
      ),
    ),
  );
}

function priorityLevel(score: number): RecommendationPriorityLevel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function offPageAction(gap: CitationRecommendationGap): string {
  if (gap.targetCommunity) {
    return `Review the discussion in ${gap.targetCommunity} and, when you can add first-hand value, contribute transparently without promotional spam. Use the exact thread as the destination: ${gap.targetUrl}`;
  }
  if (gap.classification.domainType === "editorial") {
    return `Review ${gap.targetUrl}, then pitch a useful update, expert contribution, or relevant inclusion to the publisher.`;
  }
  if (gap.classification.domainType === "ugc") {
    return `Review ${gap.targetUrl} and add a useful, transparent contribution where participation is open and relevant.`;
  }
  return `Review the exact cited page at ${gap.targetUrl}, identify why competitors appear there, and pursue a relevant inclusion or contribution through that site's normal process.`;
}

function hostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAuditIssueType(value: string): value is AuditIssueType {
  return Object.hasOwn(AUDIT_ISSUE_TYPES, value);
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError("generatedAt must be a valid date");
  }
  return value;
}

function formatDays(value: number): string {
  if (value < 1) return "less than a day";
  const rounded = Math.round(value);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
