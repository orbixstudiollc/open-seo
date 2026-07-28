import { describe, expect, it } from "vitest";
import type { CitationClassificationRow } from "@/server/features/ai-visibility/repositories/AiCitationIntelligenceRepository";
import {
  CITATION_DOMAIN_RULE_VERSION,
  classifyCitationDomain,
} from "./citationDomainClassification";

const base = {
  hostnames: [] as string[],
  classifications: [] as CitationClassificationRow[],
  trackedBrandDomains: new Set<string>(),
};

describe("citation domain classification", () => {
  it("applies a reviewed manual domain override before maintained rules", () => {
    expect(
      classifyCitationDomain({
        ...base,
        domain: "reddit.com",
        hostnames: ["reddit.com"],
        classifications: [
          {
            domain: "reddit.com",
            matchScope: "registrable_domain",
            domainType: "other",
            method: "manual",
            ruleVersion: "project-review-2",
            confidence: 1,
            reviewedAt: "2026-07-27T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      domainType: "other",
      method: "manual",
      matchScope: "registrable_domain",
      ruleVersion: "project-review-2",
      confidence: 1,
    });
  });

  it("does not publish unreviewed manual rows or model suggestions as fact", () => {
    const rows: CitationClassificationRow[] = [
      {
        domain: "unreviewed.example",
        matchScope: "registrable_domain",
        domainType: "editorial",
        method: "manual",
        ruleVersion: "draft",
        confidence: 0.8,
        reviewedAt: null,
      },
      {
        domain: "unreviewed.example",
        matchScope: "registrable_domain",
        domainType: "corporate",
        method: "model_suggestion",
        ruleVersion: "model-1",
        confidence: 0.9,
        reviewedAt: "2026-07-27T00:00:00.000Z",
      },
    ];

    expect(
      classifyCitationDomain({
        ...base,
        domain: "unreviewed.example",
        hostnames: ["unreviewed.example"],
        classifications: rows,
      }),
    ).toMatchObject({
      domainType: "unknown",
      method: "unclassified",
    });
  });

  it.each([
    ["reddit.com", "ugc"],
    ["community.medium.com", "ugc"],
    ["wikipedia.org", "reference"],
    ["techcrunch.com", "editorial"],
  ] as const)(
    "classifies %s with the curated registry",
    (domain, domainType) => {
      expect(
        classifyCitationDomain({
          ...base,
          domain,
          hostnames: [domain],
        }),
      ).toMatchObject({
        domainType,
        method: "curated_rule",
        ruleVersion: CITATION_DOMAIN_RULE_VERSION,
      });
    },
  );

  it.each(["agency.gov", "service.gov.uk", "university.edu", "lab.ac.uk"])(
    "uses only a narrow institutional suffix heuristic for %s",
    (domain) => {
      expect(
        classifyCitationDomain({
          ...base,
          domain,
          hostnames: [domain],
        }),
      ).toMatchObject({
        domainType: "institutional",
        method: "heuristic",
      });
    },
  );

  it("does not infer institutional status from .org", () => {
    expect(
      classifyCitationDomain({
        ...base,
        domain: "foundation.org",
        hostnames: ["foundation.org"],
      }),
    ).toMatchObject({
      domainType: "unknown",
      method: "unclassified",
    });
  });

  it("uses active tracked brand domains as an explicit corporate signal", () => {
    expect(
      classifyCitationDomain({
        ...base,
        domain: "competitor.example",
        hostnames: ["docs.competitor.example"],
        trackedBrandDomains: new Set(["competitor.example"]),
      }),
    ).toMatchObject({
      domainType: "corporate",
      method: "brand_registry",
    });
  });
});
