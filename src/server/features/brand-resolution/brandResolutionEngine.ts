export const BRAND_RESOLUTION_RULE_VERSION = "brand-resolution-v1";

export type BrandResolutionState =
  | "resolved"
  | "suppressed"
  | "needs_review"
  | "unresolved";

export type BrandResolutionSource =
  | "manual"
  | "registry"
  | "generic"
  | "ambiguous"
  | "unresolved";

export type BrandResolutionEvidenceKind =
  | "primary_domain"
  | "verified_alias"
  | "canonical_name"
  | "generic_taxonomy"
  | "conflicting_signal"
  | "clustering_signal"
  | "manual_reason";

export type BrandResolutionEvidence = {
  kind: BrandResolutionEvidenceKind;
  value: string;
};

export type BrandResolutionDecision = {
  state: BrandResolutionState;
  brandId: string | null;
  source: BrandResolutionSource;
  ruleVersion: string;
  confidence: number;
  reason: string;
  evidence: BrandResolutionEvidence[];
};

export type ResolutionBrand = {
  id: string;
  name: string;
  normalizedName: string;
  domain: string | null;
  archivedAt: string | null;
};

export type ResolutionAlias = {
  brandId: string;
  alias: string;
  normalizedAlias: string;
  archivedAt: string | null;
};

export type ResolutionCandidate = {
  normalizedName: string;
  rawNames: string[];
};

type MergeSuggestion = {
  id: string;
  sourceNormalizedName: string;
  targetBrandId: string;
  targetBrandName: string;
  confidence: number;
  ruleVersion: string;
  evidence: BrandResolutionEvidence[];
};

const GENERIC_TERMS = new Set([
  "ai",
  "agency",
  "artificial intelligence",
  "product design agency",
  "saas",
  "software as a service",
]);

const GENERIC_TOKENS = new Set(["agency", "ai", "saas"]);

const CLUSTER_SUFFIXES = [
  ".agency",
  " digital agency",
  " ui kits",
  " community",
  " global",
  " agency",
  " ai",
] as const;

export function normalizeBrandCandidate(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

function genericTermFor(normalizedName: string): string | null {
  return GENERIC_TERMS.has(normalizedName) ? normalizedName : null;
}

function containsGenericToken(normalizedName: string): boolean {
  return normalizedName
    .split(/[\s./_-]+/)
    .some((token) => GENERIC_TOKENS.has(token));
}

function activeRegistryMatches(
  normalizedName: string,
  brands: ResolutionBrand[],
  aliases: ResolutionAlias[],
) {
  const activeBrands = brands.filter((brand) => !brand.archivedAt);
  const activeBrandIds = new Set(activeBrands.map((brand) => brand.id));
  const matches = new Map<
    string,
    { brand: ResolutionBrand; evidence: BrandResolutionEvidence[] }
  >();

  for (const brand of activeBrands) {
    if (normalizeBrandCandidate(brand.normalizedName) !== normalizedName) {
      continue;
    }
    matches.set(brand.id, {
      brand,
      evidence: [{ kind: "canonical_name", value: brand.name }],
    });
  }

  for (const alias of aliases) {
    if (
      alias.archivedAt ||
      !activeBrandIds.has(alias.brandId) ||
      normalizeBrandCandidate(alias.normalizedAlias) !== normalizedName
    ) {
      continue;
    }
    const brand = activeBrands.find((row) => row.id === alias.brandId);
    if (!brand) continue;
    const existing = matches.get(brand.id);
    matches.set(brand.id, {
      brand,
      evidence: [
        ...(existing?.evidence ?? []),
        { kind: "verified_alias", value: alias.alias },
      ],
    });
  }

  return [...matches.values()];
}

/**
 * Apply the audited hierarchy. A manual rule is accepted only when it is the
 * caller's current unsuperseded rule; suggestions never enter this function.
 */
export function resolveBrandCandidate(input: {
  candidate: ResolutionCandidate;
  brands: ResolutionBrand[];
  aliases: ResolutionAlias[];
  manualDecision?: BrandResolutionDecision;
}): BrandResolutionDecision {
  if (input.manualDecision?.source === "manual") {
    return input.manualDecision;
  }

  const normalizedName = normalizeBrandCandidate(
    input.candidate.normalizedName,
  );
  const registryMatches = activeRegistryMatches(
    normalizedName,
    input.brands,
    input.aliases,
  );

  if (registryMatches.length === 1) {
    const [{ brand, evidence }] = registryMatches;
    if (brand.domain) {
      evidence.push({ kind: "primary_domain", value: brand.domain });
    }
    return {
      state: "resolved",
      brandId: brand.id,
      source: "registry",
      ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
      confidence: 1,
      reason: "Exact verified registry match",
      evidence,
    };
  }

  if (registryMatches.length > 1) {
    return {
      state: "needs_review",
      brandId: null,
      source: "ambiguous",
      ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
      confidence: 0.5,
      reason: "Candidate matches more than one verified brand",
      evidence: registryMatches.map(({ brand }) => ({
        kind: "conflicting_signal",
        value: `Verified registry match: ${brand.name}`,
      })),
    };
  }

  const genericTerm = genericTermFor(normalizedName);
  if (genericTerm) {
    return {
      state: "suppressed",
      brandId: null,
      source: "generic",
      ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
      confidence: 0.99,
      reason: "Exact generic taxonomy match with no verified brand",
      evidence: [{ kind: "generic_taxonomy", value: genericTerm }],
    };
  }

  if (containsGenericToken(normalizedName)) {
    return {
      state: "needs_review",
      brandId: null,
      source: "ambiguous",
      ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
      confidence: 0.5,
      reason: "Brand-like candidate contains a generic category term",
      evidence: [
        {
          kind: "conflicting_signal",
          value: "Brand-like name and generic category token",
        },
      ],
    };
  }

  return {
    state: "unresolved",
    brandId: null,
    source: "unresolved",
    ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
    confidence: 0,
    reason: "No verified registry or generic taxonomy match",
    evidence: [],
  };
}

function clusterRoot(normalizedName: string): string | null {
  for (const suffix of CLUSTER_SUFFIXES) {
    if (!normalizedName.endsWith(suffix)) continue;
    const root = normalizedName.slice(0, -suffix.length).trim();
    if (root.length >= 2 && !GENERIC_TERMS.has(root)) return root;
  }
  if (normalizedName.endsWith(".")) {
    const root = normalizedName.slice(0, -1).trim();
    if (root.length >= 2) return root;
  }
  return null;
}

/**
 * Conservative name-family clustering. The result is review information only:
 * the resolver never consumes it as a canonical assignment.
 */
export function suggestBrandMerges(input: {
  candidates: ResolutionCandidate[];
  brands: ResolutionBrand[];
}): MergeSuggestion[] {
  const activeBrands = input.brands.filter((brand) => !brand.archivedAt);
  const suggestions: MergeSuggestion[] = [];

  for (const candidate of input.candidates) {
    const sourceNormalizedName = normalizeBrandCandidate(
      candidate.normalizedName,
    );
    const root = clusterRoot(sourceNormalizedName);
    if (!root) continue;
    const target = activeBrands.find(
      (brand) => normalizeBrandCandidate(brand.normalizedName) === root,
    );
    if (!target || target.normalizedName === sourceNormalizedName) continue;

    suggestions.push({
      id: `${BRAND_RESOLUTION_RULE_VERSION}:${sourceNormalizedName}:${target.id}`,
      sourceNormalizedName,
      targetBrandId: target.id,
      targetBrandName: target.name,
      confidence: 0.65,
      ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
      evidence: [
        {
          kind: "clustering_signal",
          value: `Name-family root "${root}" matches ${target.name}`,
        },
      ],
    });
  }

  return suggestions.toSorted((a, b) =>
    a.sourceNormalizedName.localeCompare(b.sourceNormalizedName),
  );
}
