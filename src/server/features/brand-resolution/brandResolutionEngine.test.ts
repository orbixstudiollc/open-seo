import { describe, expect, it } from "vitest";
import {
  BRAND_RESOLUTION_RULE_VERSION,
  resolveBrandCandidate,
  suggestBrandMerges,
  type ResolutionAlias,
  type ResolutionBrand,
  type ResolutionCandidate,
} from "./brandResolutionEngine";

const brands: ResolutionBrand[] = [
  {
    id: "clay",
    name: "Clay",
    normalizedName: "clay",
    domain: "clay.global",
    archivedAt: null,
  },
  {
    id: "figma",
    name: "Figma",
    normalizedName: "figma",
    domain: "figma.com",
    archivedAt: null,
  },
  {
    id: "lazarev",
    name: "Lazarev",
    normalizedName: "lazarev",
    domain: "lazarev.agency",
    archivedAt: null,
  },
  {
    id: "wavespace",
    name: "Wavespace",
    normalizedName: "wavespace",
    domain: "wavespace.agency",
    archivedAt: null,
  },
  {
    id: "brix",
    name: "Brix Agency",
    normalizedName: "brix agency",
    domain: "brixagency.com",
    archivedAt: null,
  },
];

const aliases: ResolutionAlias[] = [
  ["clay", "Clay Global"],
  ["figma", "Figma AI"],
  ["figma", "Figma UI Kits"],
  ["figma", "Figma Community"],
  ["lazarev", "Lazarev."],
  ["lazarev", "Lazarev.agency"],
  ["wavespace", "Wavespace Digital Agency"],
].map(([brandId, alias]) => ({
  brandId,
  alias,
  normalizedAlias: alias.toLowerCase(),
  archivedAt: null,
}));

const corpus = [
  "SaaS",
  "AI",
  "Clay",
  "Clay Global",
  "Figma",
  "Figma AI",
  "Figma UI Kits",
  "Figma Community",
  "Lazarev",
  "Lazarev.",
  "Lazarev.agency",
  "Wavespace",
  "Wavespace Digital Agency",
  "Agency",
  "Agency A",
  "Agency B",
  "Agency C",
  "Product design agency",
  "Brix Agency",
] satisfies string[];

const candidate = (name: string): ResolutionCandidate => ({
  normalizedName: name.toLowerCase(),
  rawNames: [name],
});

describe("brand resolution hierarchy", () => {
  it("resolves the brief corpus without generic leaderboard brands or over-merging", () => {
    const decisions = new Map(
      corpus.map((name) => [
        name,
        resolveBrandCandidate({
          candidate: candidate(name),
          brands,
          aliases,
        }),
      ]),
    );

    expect(decisions.get("SaaS")).toMatchObject({
      state: "suppressed",
      source: "generic",
      brandId: null,
    });
    expect(decisions.get("AI")).toMatchObject({
      state: "suppressed",
      source: "generic",
      brandId: null,
    });
    expect(decisions.get("Clay")?.brandId).toBe("clay");
    expect(decisions.get("Clay Global")?.brandId).toBe("clay");
    expect(
      ["Figma", "Figma AI", "Figma UI Kits", "Figma Community"].map(
        (name) => decisions.get(name)?.brandId,
      ),
    ).toEqual(["figma", "figma", "figma", "figma"]);
    expect(
      ["Lazarev", "Lazarev.", "Lazarev.agency"].map(
        (name) => decisions.get(name)?.brandId,
      ),
    ).toEqual(["lazarev", "lazarev", "lazarev"]);
    expect(
      ["Wavespace", "Wavespace Digital Agency"].map(
        (name) => decisions.get(name)?.brandId,
      ),
    ).toEqual(["wavespace", "wavespace"]);
    expect(decisions.get("Agency")).toMatchObject({ state: "suppressed" });
    expect(decisions.get("Product design agency")).toMatchObject({
      state: "suppressed",
    });
    expect(
      ["Agency A", "Agency B", "Agency C"].map(
        (name) => decisions.get(name)?.state,
      ),
    ).toEqual(["needs_review", "needs_review", "needs_review"]);
    expect(decisions.get("Brix Agency")).toMatchObject({
      state: "resolved",
      brandId: "brix",
    });
  });

  it("lets a current manual decision override registry and generic rules", () => {
    const manualDecision = {
      state: "resolved" as const,
      brandId: "manual-ai",
      source: "manual" as const,
      ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
      confidence: 1,
      reason: "Reviewed common-noun brand",
      evidence: [
        { kind: "manual_reason" as const, value: "Confirmed by owner" },
      ],
    };

    expect(
      resolveBrandCandidate({
        candidate: candidate("AI"),
        brands,
        aliases,
        manualDecision,
      }),
    ).toEqual(manualDecision);
  });

  it("keeps an unregistered generic-like brand off the leaderboard for review", () => {
    expect(
      resolveBrandCandidate({
        candidate: candidate("Brix Agency"),
        brands: [],
        aliases: [],
      }),
    ).toMatchObject({
      state: "needs_review",
      source: "ambiguous",
      brandId: null,
    });
  });

  it("returns clustering as a suggestion without changing resolution", () => {
    const clayGlobal = candidate("Clay Global");
    const decision = resolveBrandCandidate({
      candidate: clayGlobal,
      brands,
      aliases: [],
    });
    const suggestions = suggestBrandMerges({
      candidates: [clayGlobal],
      brands,
    });

    expect(decision).toMatchObject({
      state: "unresolved",
      brandId: null,
    });
    expect(suggestions).toEqual([
      expect.objectContaining({
        sourceNormalizedName: "clay global",
        targetBrandId: "clay",
        ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
      }),
    ]);
  });
});
