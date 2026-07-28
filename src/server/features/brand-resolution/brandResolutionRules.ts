import type { ReplacementRule } from "./BrandResolutionRepository";
import type { BrandResolutionDecision } from "./brandResolutionEngine";

export function replacementFor(input: {
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
