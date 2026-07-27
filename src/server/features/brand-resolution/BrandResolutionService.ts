import {
  BrandResolutionRepository,
  type BrandResolutionEvidenceRecord,
  type BrandResolutionRuleRecord,
  type ReplacementRule,
} from "./BrandResolutionRepository";
import {
  BRAND_RESOLUTION_RULE_VERSION,
  normalizeBrandCandidate,
  resolveBrandCandidate,
  suggestBrandMerges,
  type BrandResolutionDecision,
  type BrandResolutionEvidence,
  type ResolutionCandidate,
} from "./brandResolutionEngine";
import type { BrandResolutionAction } from "@/types/schemas/brand-resolution";
import { AppError } from "@/server/lib/errors";

type Repository = typeof BrandResolutionRepository;

type MentionRow = Awaited<ReturnType<Repository["listMentionRows"]>>[number];
type Registry = Awaited<ReturnType<Repository["getRegistry"]>>;

type CandidateAggregate = ResolutionCandidate & {
  mentionCount: number;
  mentionRowCount: number;
};

const MAX_MENTION_ROWS = 5_000;

function groupCandidates(rows: MentionRow[]): CandidateAggregate[] {
  const candidates = new Map<
    string,
    {
      rawNames: Set<string>;
      mentionCount: number;
      mentionRowCount: number;
    }
  >();
  for (const row of rows) {
    const normalizedName = normalizeBrandCandidate(row.normalizedName);
    const aggregate = candidates.get(normalizedName) ?? {
      rawNames: new Set<string>(),
      mentionCount: 0,
      mentionRowCount: 0,
    };
    aggregate.rawNames.add(row.rawName);
    aggregate.mentionCount += row.mentionCount;
    aggregate.mentionRowCount += 1;
    candidates.set(normalizedName, aggregate);
  }
  return [...candidates.entries()]
    .map(([normalizedName, aggregate]) => ({
      normalizedName,
      rawNames: [...aggregate.rawNames].toSorted(),
      mentionCount: aggregate.mentionCount,
      mentionRowCount: aggregate.mentionRowCount,
    }))
    .toSorted((a, b) => {
      const countOrder = b.mentionCount - a.mentionCount;
      return countOrder || a.normalizedName.localeCompare(b.normalizedName);
    });
}

function evidenceByRuleId(rows: BrandResolutionEvidenceRecord[]) {
  const byRuleId = new Map<string, BrandResolutionEvidence[]>();
  for (const row of rows) {
    const evidence = byRuleId.get(row.ruleId) ?? [];
    evidence.push({ kind: row.kind, value: row.value });
    byRuleId.set(row.ruleId, evidence);
  }
  return byRuleId;
}

function decisionFromRule(
  rule: BrandResolutionRuleRecord,
  evidence: BrandResolutionEvidence[],
): BrandResolutionDecision {
  return {
    state: rule.state,
    brandId: rule.brandId,
    source: rule.source,
    ruleVersion: rule.ruleVersion,
    confidence: rule.confidence,
    reason: rule.reason ?? "Persisted brand resolution rule",
    evidence,
  };
}

function sameDecision(
  rule: BrandResolutionRuleRecord | undefined,
  decision: BrandResolutionDecision,
) {
  return (
    rule?.state === decision.state &&
    rule.brandId === decision.brandId &&
    rule.source === decision.source &&
    rule.ruleVersion === decision.ruleVersion &&
    rule.confidence === decision.confidence &&
    rule.reason === decision.reason
  );
}

function replacementFor(input: {
  projectId: string;
  normalizedName: string;
  decision: BrandResolutionDecision;
  createdBy?: string;
}): ReplacementRule {
  const ruleId = crypto.randomUUID();
  return {
    id: ruleId,
    projectId: input.projectId,
    normalizedName: input.normalizedName,
    state: input.decision.state,
    brandId: input.decision.brandId,
    source: input.decision.source,
    ruleVersion: input.decision.ruleVersion,
    confidence: input.decision.confidence,
    createdBy: input.createdBy,
    reason: input.decision.reason,
    evidence: input.decision.evidence.map((item) => ({
      id: crypto.randomUUID(),
      kind: item.kind,
      value: item.value,
    })),
  };
}

function registryForEngine(registry: Registry) {
  return {
    brands: registry.brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      normalizedName: brand.normalizedName,
      domain: brand.domain,
      archivedAt: brand.archivedAt,
    })),
    aliases: registry.aliases.map((alias) => ({
      brandId: alias.brandId,
      alias: alias.alias,
      normalizedAlias: alias.normalizedAlias,
      archivedAt: alias.archivedAt,
    })),
  };
}

export function createBrandResolutionService(repository: Repository) {
  async function getResolutionState(projectId: string) {
    const [mentionRows, registry, activeRules, history] = await Promise.all([
      repository.listMentionRows(projectId, MAX_MENTION_ROWS),
      repository.getRegistry(projectId),
      repository.listActiveRules(projectId),
      repository.listRuleHistory(projectId),
    ]);
    const allRules = new Map(
      [...activeRules, ...history].map((rule) => [rule.id, rule]),
    );
    const evidenceRows = await repository.listEvidence([...allRules.keys()]);
    const evidenceMap = evidenceByRuleId(evidenceRows);
    const activeByName = new Map(
      activeRules.map((rule) => [rule.normalizedName, rule]),
    );
    const engineRegistry = registryForEngine(registry);
    const candidates = groupCandidates(mentionRows);
    const rows = candidates.map((candidate) => {
      const activeRule = activeByName.get(candidate.normalizedName);
      const persistedDecision = activeRule
        ? decisionFromRule(activeRule, evidenceMap.get(activeRule.id) ?? [])
        : undefined;
      const decision =
        persistedDecision ??
        resolveBrandCandidate({
          candidate,
          ...engineRegistry,
        });
      const brand = decision.brandId
        ? (registry.brands.find((item) => item.id === decision.brandId) ?? null)
        : null;
      return {
        ...candidate,
        ruleId: activeRule?.id ?? null,
        persisted: Boolean(activeRule),
        decision,
        brand: brand
          ? { id: brand.id, name: brand.name, domain: brand.domain }
          : null,
      };
    });
    const suggestions = suggestBrandMerges({
      candidates,
      brands: engineRegistry.brands,
    }).filter((suggestion) => {
      const row = rows.find(
        (candidate) =>
          candidate.normalizedName === suggestion.sourceNormalizedName,
      );
      return row?.decision.state !== "resolved";
    });
    const canonicalByBrandId = new Map<
      string,
      {
        brand: { id: string; name: string; domain: string | null };
        mentionCount: number;
        mentionRowCount: number;
        normalizedNames: Set<string>;
        rawNames: Set<string>;
      }
    >();
    for (const row of rows) {
      if (row.decision.state !== "resolved" || !row.brand) continue;
      const aggregate = canonicalByBrandId.get(row.brand.id) ?? {
        brand: row.brand,
        mentionCount: 0,
        mentionRowCount: 0,
        normalizedNames: new Set<string>(),
        rawNames: new Set<string>(),
      };
      aggregate.mentionCount += row.mentionCount;
      aggregate.mentionRowCount += row.mentionRowCount;
      aggregate.normalizedNames.add(row.normalizedName);
      for (const rawName of row.rawNames) aggregate.rawNames.add(rawName);
      canonicalByBrandId.set(row.brand.id, aggregate);
    }
    const canonicalBrands = [...canonicalByBrandId.values()]
      .map((aggregate) => ({
        brand: aggregate.brand,
        mentionCount: aggregate.mentionCount,
        mentionRowCount: aggregate.mentionRowCount,
        normalizedNames: [...aggregate.normalizedNames].toSorted(),
        rawNames: [...aggregate.rawNames].toSorted(),
      }))
      .toSorted((a, b) => {
        const countOrder = b.mentionCount - a.mentionCount;
        return countOrder || a.brand.name.localeCompare(b.brand.name);
      });

    return {
      summary: {
        candidates: rows.length,
        resolved: rows.filter((row) => row.decision.state === "resolved")
          .length,
        suppressed: rows.filter((row) => row.decision.state === "suppressed")
          .length,
        needsReview: rows.filter((row) => row.decision.state === "needs_review")
          .length,
        unresolved: rows.filter((row) => row.decision.state === "unresolved")
          .length,
        mentionCount: rows.reduce((sum, row) => sum + row.mentionCount, 0),
      },
      candidates: rows,
      canonicalBrands,
      suggestions,
      brands: registry.brands
        .filter((brand) => !brand.archivedAt)
        .map((brand) => ({
          id: brand.id,
          name: brand.name,
          normalizedName: brand.normalizedName,
          domain: brand.domain,
        })),
      history: history.map((rule) => ({
        ...rule,
        evidence: evidenceMap.get(rule.id) ?? [],
      })),
      truncated: mentionRows.length >= MAX_MENTION_ROWS,
      ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
    };
  }

  async function refreshAutomaticResolutions(projectId: string) {
    const [mentionRows, registry, activeRules] = await Promise.all([
      repository.listMentionRows(projectId, MAX_MENTION_ROWS),
      repository.getRegistry(projectId),
      repository.listActiveRules(projectId),
    ]);
    const activeByName = new Map(
      activeRules.map((rule) => [rule.normalizedName, rule]),
    );
    const engineRegistry = registryForEngine(registry);
    const replacements: ReplacementRule[] = [];

    for (const candidate of groupCandidates(mentionRows)) {
      const activeRule = activeByName.get(candidate.normalizedName);
      if (activeRule?.source === "manual") continue;
      const decision = resolveBrandCandidate({
        candidate,
        ...engineRegistry,
      });
      if (sameDecision(activeRule, decision)) continue;
      replacements.push(
        replacementFor({
          projectId,
          normalizedName: candidate.normalizedName,
          decision,
        }),
      );
    }

    await repository.replaceRules(projectId, replacements);
    return {
      updated: replacements.length,
      state: await getResolutionState(projectId),
    };
  }

  async function getOrCreateCanonicalBrand(
    projectId: string,
    input: {
      brandId?: string;
      canonicalName: string;
      domain?: string;
    },
  ) {
    if (input.brandId) {
      const brand = await repository.getBrandById(projectId, input.brandId);
      if (!brand || brand.archivedAt) {
        throw new AppError("NOT_FOUND", "Canonical brand was not found");
      }
      return brand;
    }
    const normalizedName = normalizeBrandCandidate(input.canonicalName);
    const existing = await repository.getBrandByNormalizedName(
      projectId,
      normalizedName,
    );
    if (existing && !existing.archivedAt) return existing;
    if (existing) {
      throw new AppError(
        "VALIDATION_ERROR",
        "An archived canonical brand already uses this name",
      );
    }
    return repository.createBrand({
      id: crypto.randomUUID(),
      projectId,
      name: input.canonicalName.trim(),
      normalizedName,
      domain: input.domain,
    });
  }

  async function applyManualAction(
    action: BrandResolutionAction,
    actorId: string,
  ) {
    const normalizedNames = [
      ...new Set(action.normalizedNames.map(normalizeBrandCandidate)),
    ];
    if (normalizedNames.some((name) => name.length === 0)) {
      throw new AppError("VALIDATION_ERROR", "Brand name cannot be empty");
    }

    let decision: BrandResolutionDecision;
    if (
      action.action === "merge" ||
      action.action === "split" ||
      action.action === "restore"
    ) {
      const brand = await getOrCreateCanonicalBrand(action.projectId, action);
      decision = {
        state: "resolved",
        brandId: brand.id,
        source: "manual",
        ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
        confidence: 1,
        reason: action.reason,
        evidence: [{ kind: "manual_reason", value: action.reason }],
      };
    } else if (action.action === "suppress") {
      decision = {
        state: "suppressed",
        brandId: null,
        source: "manual",
        ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
        confidence: 1,
        reason: action.reason,
        evidence: [{ kind: "manual_reason", value: action.reason }],
      };
    } else {
      decision = {
        state: "needs_review",
        brandId: null,
        source: "manual",
        ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
        confidence: 1,
        reason: action.reason,
        evidence: [{ kind: "manual_reason", value: action.reason }],
      };
    }

    await repository.replaceRules(
      action.projectId,
      normalizedNames.map((normalizedName) =>
        replacementFor({
          projectId: action.projectId,
          normalizedName,
          decision,
          createdBy: actorId,
        }),
      ),
    );
    return getResolutionState(action.projectId);
  }

  return {
    getResolutionState,
    refreshAutomaticResolutions,
    applyManualAction,
  };
}

export const BrandResolutionService = createBrandResolutionService(
  BrandResolutionRepository,
);
