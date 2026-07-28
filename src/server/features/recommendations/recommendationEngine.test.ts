import { describe, expect, it } from "vitest";
import type { CitationRecommendationGap } from "@/types/schemas/citation-intelligence";
import {
  buildRecommendationCandidates,
  type AuditRecommendationSource,
} from "./recommendationEngine";

const GENERATED_AT = new Date("2026-07-28T12:00:00.000Z");

describe("evidence-carrying recommendation generation", () => {
  it("links every candidate to its source and explains the complete score", () => {
    const candidates = buildRecommendationCandidates({
      generatedAt: GENERATED_AT,
      auditSource,
      citationGaps: [citationGap],
    });

    expect(candidates).toHaveLength(3);
    const onPage = candidates.find(
      (candidate) => candidate.category === "on_page",
    )!;
    expect(onPage).toMatchObject({
      ruleKey: "site_audit:missing-title",
      targetUrl: "https://example.com/",
      occurrenceCount: 1,
      affectedPageCount: 1,
    });
    expect(onPage.auditEvidence).toEqual([
      expect.objectContaining({
        auditIssueId: "issue-title",
        sourceAuditId: "audit-latest",
        issueType: "missing-title",
      }),
    ]);

    const technical = candidates.find(
      (candidate) => candidate.category === "technical",
    )!;
    expect(technical.targetLabel).toBe(
      "https://example.com/docs → https://example.com/missing",
    );
    expect(technical.auditEvidence[0]).toMatchObject({
      auditIssueId: "issue-link",
      issueType: "broken-internal-link",
    });
    expect(
      candidates.some((candidate) =>
        candidate.fingerprint.includes("issue-invalid"),
      ),
    ).toBe(false);

    const offPage = candidates.find(
      (candidate) => candidate.category === "off_page",
    )!;
    expect(offPage).toMatchObject({
      targetUrl: "https://reddit.com/r/seo/comments/abc/source-thread",
      targetCommunity: "r/seo",
      citationCount: 2,
      answerCount: 2,
      promptCount: 2,
      targetBrandCitationCount: 0,
    });
    expect(offPage.citationEvidence).toHaveLength(2);
    expect(
      offPage.citationEvidence.every(
        (evidence) =>
          evidence.citationId > 0 && evidence.competitorBrandId.length > 0,
      ),
    ).toBe(true);

    for (const candidate of candidates) {
      expect(candidate.priorityScore).toBe(
        Math.round(
          candidate.scoreFactors.reduce(
            (total, factor) => total + factor.contribution,
            0,
          ),
        ),
      );
      expect(candidate.scoreFactors.every((factor) => factor.explanation)).toBe(
        true,
      );
    }
  });

  it("keeps fingerprints independent of source run ids, counts, and scores", () => {
    const first = buildRecommendationCandidates({
      generatedAt: GENERATED_AT,
      auditSource,
      citationGaps: [citationGap],
    });
    const regenerated = buildRecommendationCandidates({
      generatedAt: new Date("2026-08-01T12:00:00.000Z"),
      auditSource: {
        audit: { ...auditSource.audit, id: "new-audit" },
        findings: auditSource.findings.map((finding) => ({
          ...finding,
          id: `new-${finding.id}`,
          auditId: "new-audit",
        })),
      },
      citationGaps: [
        {
          ...citationGap,
          citationCount: 12,
          answerCount: 8,
          lastObservedAt: "2026-08-01T10:00:00.000Z",
        },
      ],
    });

    expect(first.map((candidate) => candidate.fingerprint).toSorted()).toEqual(
      regenerated.map((candidate) => candidate.fingerprint).toSorted(),
    );
    expect(
      first.find((candidate) => candidate.category === "off_page")
        ?.priorityScore,
    ).not.toBe(
      regenerated.find((candidate) => candidate.category === "off_page")
        ?.priorityScore,
    );
  });
});

const auditSource: AuditRecommendationSource = {
  audit: {
    id: "audit-latest",
    startUrl: "https://example.com/",
    completedAt: "2026-07-27T12:00:00.000Z",
  },
  findings: [
    {
      id: "issue-title",
      auditId: "audit-latest",
      pageId: "page-home",
      pageUrl: "https://example.com/",
      issueType: "missing-title",
      severity: "critical",
      detailsJson: null,
      crawlDepth: 0,
      inSitemap: true,
    },
    {
      id: "issue-link",
      auditId: "audit-latest",
      pageId: "page-docs",
      pageUrl: "https://example.com/docs",
      issueType: "broken-internal-link",
      severity: "critical",
      detailsJson: JSON.stringify({
        targetUrl: "https://example.com/missing",
        targetStatus: 404,
      }),
      crawlDepth: 1,
      inSitemap: true,
    },
    {
      id: "issue-invalid",
      auditId: "audit-latest",
      pageId: "page-invalid",
      pageUrl: "https://example.com/invalid",
      issueType: "broken-internal-link",
      severity: "critical",
      detailsJson: JSON.stringify({ targetUrl: "not a URL" }),
      crawlDepth: 2,
      inSitemap: false,
    },
  ],
};

const citationGap: CitationRecommendationGap = {
  targetUrl: "https://reddit.com/r/seo/comments/abc/source-thread",
  targetHostname: "reddit.com",
  targetDomain: "reddit.com",
  targetTitle: "How teams choose SEO software",
  targetCommunity: "r/seo",
  classification: {
    domainType: "ugc",
    method: "curated_rule",
    matchScope: "registrable_domain",
    ruleVersion: "citation-domain-rules-v1",
    confidence: 0.98,
  },
  competitorBrands: [{ id: "competitor", name: "Rival" }],
  citationCount: 2,
  answerCount: 2,
  promptCount: 2,
  targetBrandCitationCount: 0,
  firstObservedAt: "2026-07-20T12:00:00.000Z",
  lastObservedAt: "2026-07-27T12:00:00.000Z",
  evidenceWindowStart: "2026-06-28T12:00:00.000Z",
  evidenceWindowEnd: "2026-07-28T12:00:00.000Z",
  modelDistribution: [
    { model: "chat_gpt", answers: 1 },
    { model: "perplexity", answers: 1 },
  ],
  evidence: [
    {
      citationId: 41,
      answerId: "answer-1",
      competitorBrandId: "competitor",
      competitorBrandName: "Rival",
      sourceUrl: "https://reddit.com/r/seo/comments/abc/source-thread",
      sourceHostname: "reddit.com",
      sourceTitle: "How teams choose SEO software",
      promptText: "Which SEO tools do teams recommend?",
      model: "chat_gpt",
      observedAt: "2026-07-20T12:00:00.000Z",
    },
    {
      citationId: 42,
      answerId: "answer-2",
      competitorBrandId: "competitor",
      competitorBrandName: "Rival",
      sourceUrl: "https://reddit.com/r/seo/comments/abc/source-thread",
      sourceHostname: "reddit.com",
      sourceTitle: "How teams choose SEO software",
      promptText: "What software helps with organic search?",
      model: "perplexity",
      observedAt: "2026-07-27T12:00:00.000Z",
    },
  ],
};
