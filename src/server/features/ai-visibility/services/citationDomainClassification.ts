import { getPublicSuffix } from "tldts";
import type { CitationClassificationRow } from "@/server/features/ai-visibility/repositories/AiCitationIntelligenceRepository";
import type {
  CitationDomainClassification,
  CitationDomainType,
} from "@/types/schemas/citation-intelligence";

export const CITATION_DOMAIN_RULE_VERSION = "citation-domain-v1";

type RegistryRule = {
  domainType: Exclude<CitationDomainType, "unknown">;
  domains: readonly string[];
};

const CURATED_RULES: readonly RegistryRule[] = [
  {
    domainType: "editorial",
    domains: [
      "nytimes.com",
      "theguardian.com",
      "techcrunch.com",
      "searchengineland.com",
    ],
  },
  {
    domainType: "corporate",
    domains: ["adobe.com", "hubspot.com", "microsoft.com", "openai.com"],
  },
  {
    domainType: "ugc",
    domains: [
      "medium.com",
      "quora.com",
      "reddit.com",
      "stackoverflow.com",
      "substack.com",
      "youtube.com",
      "youtu.be",
    ],
  },
  {
    domainType: "reference",
    domains: ["britannica.com", "wikidata.org", "wikipedia.org"],
  },
] as const;

type ClassifyInput = {
  domain: string;
  hostnames: string[];
  classifications: CitationClassificationRow[];
  trackedBrandDomains: Set<string>;
};

export function classifyCitationDomain(
  input: ClassifyInput,
): CitationDomainClassification {
  const domain = input.domain.toLowerCase();
  const manualDomain = input.classifications.find(
    (row) =>
      row.method === "manual" &&
      row.reviewedAt != null &&
      row.matchScope === "registrable_domain" &&
      row.domain.toLowerCase() === domain,
  );
  if (manualDomain) return fromManual(manualDomain);

  // Exact-host overrides only label a domain rollup when the rollup key and
  // hostname are identical. Applying one subdomain's override to sibling
  // hosts would turn a page/host judgement into a domain-wide claim.
  const normalizedHosts = [
    ...new Set(input.hostnames.map((host) => host.toLowerCase())),
  ];
  if (normalizedHosts.length === 1 && normalizedHosts[0] === domain) {
    const manualHost = input.classifications.find(
      (row) =>
        row.method === "manual" &&
        row.reviewedAt != null &&
        row.matchScope === "hostname" &&
        row.domain.toLowerCase() === domain,
    );
    if (manualHost) return fromManual(manualHost);
  }

  if (input.trackedBrandDomains.has(domain)) {
    return {
      domainType: "corporate",
      method: "brand_registry",
      matchScope: "registrable_domain",
      ruleVersion: CITATION_DOMAIN_RULE_VERSION,
      confidence: 1,
    };
  }

  for (const rule of CURATED_RULES) {
    if (rule.domains.some((entry) => matchesDomain(domain, entry))) {
      return {
        domainType: rule.domainType,
        method: "curated_rule",
        matchScope: "registrable_domain",
        ruleVersion: CITATION_DOMAIN_RULE_VERSION,
        confidence: 1,
      };
    }
  }

  if (isInstitutionalDomain(domain)) {
    return {
      domainType: "institutional",
      method: "heuristic",
      matchScope: "registrable_domain",
      ruleVersion: CITATION_DOMAIN_RULE_VERSION,
      confidence: 0.95,
    };
  }

  return {
    domainType: "unknown",
    method: "unclassified",
    matchScope: null,
    ruleVersion: CITATION_DOMAIN_RULE_VERSION,
    confidence: null,
  };
}

function fromManual(
  row: CitationClassificationRow,
): CitationDomainClassification {
  return {
    domainType: row.domainType,
    method: "manual",
    matchScope: row.matchScope,
    ruleVersion: row.ruleVersion,
    confidence: row.confidence,
  };
}

function matchesDomain(domain: string, registryDomain: string): boolean {
  return domain === registryDomain || domain.endsWith(`.${registryDomain}`);
}

function isInstitutionalDomain(domain: string): boolean {
  const suffix = getPublicSuffix(domain, {
    allowPrivateDomains: true,
  })?.toLowerCase();
  if (!suffix) return false;
  const suffixLabels = new Set(suffix.split("."));
  return ["gov", "edu", "ac", "mil"].some((label) => suffixLabels.has(label));
}
