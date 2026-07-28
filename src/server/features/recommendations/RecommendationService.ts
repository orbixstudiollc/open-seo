import { AppError } from "@/server/lib/errors";
import { getCitationRecommendationGaps } from "@/server/features/ai-visibility/services/citationIntelligence";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import type { RecommendationStatus } from "@/types/schemas/recommendations";
import {
  buildRecommendationCandidates,
  type AuditRecommendationSource,
} from "./recommendationEngine";
import { RecommendationRepository } from "./RecommendationRepository";

const RECOMMENDATION_WINDOW_DAYS = 30;

export async function getRecommendationQueue(projectId: string) {
  return RecommendationRepository.listQueue(projectId);
}

export async function generateRecommendationQueue(input: {
  projectId: string;
  now?: Date;
}) {
  const now = validDate(input.now ?? new Date());
  const [auditResult, citationGaps] = await Promise.all([
    AuditRepository.getLatestCompletedAuditFindings(input.projectId),
    getCitationRecommendationGaps({
      projectId: input.projectId,
      windowDays: RECOMMENDATION_WINDOW_DAYS,
      asOf: now,
    }),
  ]);
  const auditSource: AuditRecommendationSource | null = auditResult
    ? {
        audit: {
          id: auditResult.audit.id,
          startUrl: auditResult.audit.startUrl,
          completedAt: auditResult.audit.completedAt,
        },
        findings: auditResult.findings,
      }
    : null;
  const candidates = buildRecommendationCandidates({
    generatedAt: now,
    auditSource,
    citationGaps,
  });
  assertEvidenceInvariants(candidates);
  const generatedAt = now.toISOString();
  for (const candidate of candidates) {
    await RecommendationRepository.upsertCandidate({
      projectId: input.projectId,
      generatedAt,
      candidate,
    });
  }
  await RecommendationRepository.markNotGeneratedInactive(
    input.projectId,
    generatedAt,
  );
  const queue = await RecommendationRepository.listQueue(input.projectId);
  return { ...queue, generatedAt };
}

export async function setRecommendationStatus(input: {
  projectId: string;
  recommendationId: string;
  status: RecommendationStatus;
  now?: Date;
}) {
  const now = validDate(input.now ?? new Date()).toISOString();
  const updated = await RecommendationRepository.updateStatus({
    projectId: input.projectId,
    recommendationId: input.recommendationId,
    status: input.status,
    now,
  });
  if (!updated) {
    throw new AppError("NOT_FOUND", "Recommendation not found");
  }
  return RecommendationRepository.listQueue(input.projectId);
}

function assertEvidenceInvariants(
  candidates: ReturnType<typeof buildRecommendationCandidates>,
): void {
  for (const candidate of candidates) {
    if (
      candidate.category === "off_page" &&
      (candidate.citationEvidence.length === 0 ||
        candidate.citationEvidence.some(
          (evidence) => !evidence.citationId || !evidence.competitorBrandId,
        ) ||
        candidate.targetBrandCitationCount !== 0)
    ) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Off-page recommendation is missing citation evidence",
      );
    }
    if (
      candidate.category !== "off_page" &&
      candidate.auditEvidence.length === 0
    ) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Site recommendation is missing audit evidence",
      );
    }
    const factorTotal = Math.round(
      candidate.scoreFactors.reduce(
        (total, factor) => total + factor.contribution,
        0,
      ),
    );
    if (factorTotal !== candidate.priorityScore) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Recommendation priority factors do not match its score",
      );
    }
  }
}

function validDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError("now must be a valid date");
  }
  return value;
}
