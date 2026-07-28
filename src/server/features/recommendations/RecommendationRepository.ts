/* eslint-disable max-lines -- normalized queue, evidence, factor, and workflow persistence remain one auditable repository. */
import { and, asc, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { executeInBatches, runBatch } from "@/db/runBatch";
import {
  recommendationAuditIssueEvidence,
  recommendationCitationEvidence,
  recommendations,
  recommendationScoreFactors,
} from "@/db/schema";
import type { RecommendationCandidate } from "./recommendationEngine";
import { recommendationHash } from "./recommendationIds";
import type {
  RecommendationItem,
  RecommendationQueue,
  RecommendationStatus,
} from "@/types/schemas/recommendations";

const READ_BATCH_SIZE = 80;

async function upsertCandidate(input: {
  projectId: string;
  generatedAt: string;
  candidate: RecommendationCandidate;
}): Promise<string> {
  const { candidate, generatedAt, projectId } = input;
  const recommendationId = await recommendationHash(
    "recommendation",
    projectId,
    candidate.fingerprint,
  );
  const mutableValues = {
    category: candidate.category,
    ruleKey: candidate.ruleKey,
    generatorVersion: candidate.generatorVersion,
    targetKind: candidate.targetKind,
    targetUrl: candidate.targetUrl,
    targetHostname: candidate.targetHostname,
    targetLabel: candidate.targetLabel,
    targetCommunity: candidate.targetCommunity,
    title: candidate.title,
    action: candidate.action,
    rationale: candidate.rationale,
    isActive: true,
    priorityLevel: candidate.priorityLevel,
    priorityScore: candidate.priorityScore,
    scoreVersion: candidate.scoreVersion,
    evidenceWindowStart: candidate.evidenceWindowStart,
    evidenceWindowEnd: candidate.evidenceWindowEnd,
    evidenceAsOf: candidate.evidenceAsOf,
    occurrenceCount: candidate.occurrenceCount,
    affectedPageCount: candidate.affectedPageCount,
    citationCount: candidate.citationCount,
    answerCount: candidate.answerCount,
    promptCount: candidate.promptCount,
    targetBrandCitationCount: candidate.targetBrandCitationCount,
    competitorCount: candidate.competitorCount,
    firstObservedAt: candidate.firstObservedAt,
    lastObservedAt: candidate.lastObservedAt,
    lastGeneratedAt: generatedAt,
    updatedAt: generatedAt,
  } as const;
  await db
    .insert(recommendations)
    .values({
      id: recommendationId,
      projectId,
      fingerprint: candidate.fingerprint,
      ...mutableValues,
    })
    .onConflictDoUpdate({
      target: [recommendations.projectId, recommendations.fingerprint],
      set: mutableValues,
    });

  const auditRows = await Promise.all(
    candidate.auditEvidence.map(async (evidence) => ({
      id: await recommendationHash(
        recommendationId,
        "audit",
        evidence.evidenceFingerprint,
      ),
      recommendationId,
      evidenceFingerprint: evidence.evidenceFingerprint,
      auditIssueId: evidence.auditIssueId,
      sourceAuditId: evidence.sourceAuditId,
      issueType: evidence.issueType,
      severity: evidence.severity,
      pageUrl: evidence.pageUrl,
      detailsJson: evidence.detailsJson,
      lastGeneratedAt: generatedAt,
    })),
  );
  await executeInBatches(auditRows, (tx, row) =>
    tx
      .insert(recommendationAuditIssueEvidence)
      .values(row)
      .onConflictDoUpdate({
        target: [
          recommendationAuditIssueEvidence.recommendationId,
          recommendationAuditIssueEvidence.evidenceFingerprint,
        ],
        set: {
          auditIssueId: row.auditIssueId,
          sourceAuditId: row.sourceAuditId,
          issueType: row.issueType,
          severity: row.severity,
          pageUrl: row.pageUrl,
          detailsJson: row.detailsJson,
          lastGeneratedAt: generatedAt,
        },
      }),
  );

  const citationRows = await Promise.all(
    candidate.citationEvidence.map(async (evidence) => {
      const evidenceFingerprint = `${evidence.citationId}:${evidence.competitorBrandId}`;
      return {
        id: await recommendationHash(
          recommendationId,
          "citation",
          evidenceFingerprint,
        ),
        recommendationId,
        evidenceFingerprint,
        citationId: evidence.citationId,
        competitorBrandId: evidence.competitorBrandId,
        evidenceRole: "competitor_source" as const,
        sourceAnswerId: evidence.answerId,
        sourceUrl: evidence.sourceUrl,
        sourceHostname: evidence.sourceHostname,
        sourceTitle: evidence.sourceTitle,
        promptText: evidence.promptText,
        model: evidence.model,
        observedAt: evidence.observedAt,
        competitorBrandName: evidence.competitorBrandName,
        lastGeneratedAt: generatedAt,
      };
    }),
  );
  await executeInBatches(citationRows, (tx, row) =>
    tx
      .insert(recommendationCitationEvidence)
      .values(row)
      .onConflictDoUpdate({
        target: [
          recommendationCitationEvidence.recommendationId,
          recommendationCitationEvidence.evidenceFingerprint,
        ],
        set: {
          citationId: row.citationId,
          competitorBrandId: row.competitorBrandId,
          sourceAnswerId: row.sourceAnswerId,
          sourceUrl: row.sourceUrl,
          sourceHostname: row.sourceHostname,
          sourceTitle: row.sourceTitle,
          promptText: row.promptText,
          model: row.model,
          observedAt: row.observedAt,
          competitorBrandName: row.competitorBrandName,
          lastGeneratedAt: generatedAt,
        },
      }),
  );

  const factorRows = await Promise.all(
    candidate.scoreFactors.map(async (factor) => ({
      id: await recommendationHash(
        recommendationId,
        "factor",
        factor.factorKey,
      ),
      recommendationId,
      factorKey: factor.factorKey,
      label: factor.label,
      rawValue: factor.rawValue,
      weight: factor.weight,
      contribution: factor.contribution,
      explanation: factor.explanation,
      lastGeneratedAt: generatedAt,
    })),
  );
  await executeInBatches(factorRows, (tx, row) =>
    tx
      .insert(recommendationScoreFactors)
      .values(row)
      .onConflictDoUpdate({
        target: [
          recommendationScoreFactors.recommendationId,
          recommendationScoreFactors.factorKey,
        ],
        set: {
          label: row.label,
          rawValue: row.rawValue,
          weight: row.weight,
          contribution: row.contribution,
          explanation: row.explanation,
          lastGeneratedAt: generatedAt,
        },
      }),
  );

  await runBatch((tx) => [
    tx
      .delete(recommendationAuditIssueEvidence)
      .where(
        and(
          eq(
            recommendationAuditIssueEvidence.recommendationId,
            recommendationId,
          ),
          lt(recommendationAuditIssueEvidence.lastGeneratedAt, generatedAt),
        ),
      ),
    tx
      .delete(recommendationCitationEvidence)
      .where(
        and(
          eq(recommendationCitationEvidence.recommendationId, recommendationId),
          lt(recommendationCitationEvidence.lastGeneratedAt, generatedAt),
        ),
      ),
    tx
      .delete(recommendationScoreFactors)
      .where(
        and(
          eq(recommendationScoreFactors.recommendationId, recommendationId),
          lt(recommendationScoreFactors.lastGeneratedAt, generatedAt),
        ),
      ),
  ]);

  return recommendationId;
}

async function markNotGeneratedInactive(
  projectId: string,
  generatedAt: string,
): Promise<void> {
  await db
    .update(recommendations)
    .set({ isActive: false, updatedAt: generatedAt })
    .where(
      and(
        eq(recommendations.projectId, projectId),
        lt(recommendations.lastGeneratedAt, generatedAt),
      ),
    );
}

async function listQueue(projectId: string): Promise<RecommendationQueue> {
  const recommendationRows = await db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.projectId, projectId),
        or(
          eq(recommendations.isActive, true),
          ne(recommendations.status, "todo"),
        ),
      ),
    )
    .orderBy(
      desc(recommendations.priorityScore),
      asc(recommendations.category),
      asc(recommendations.targetLabel),
    );
  const ids = recommendationRows.map((row) => row.id);
  const [auditRows, citationRows, factorRows] = await Promise.all([
    readInBatches(ids, (batch) =>
      db
        .select()
        .from(recommendationAuditIssueEvidence)
        .where(
          inArray(recommendationAuditIssueEvidence.recommendationId, batch),
        ),
    ),
    readInBatches(ids, (batch) =>
      db
        .select()
        .from(recommendationCitationEvidence)
        .where(inArray(recommendationCitationEvidence.recommendationId, batch)),
    ),
    readInBatches(ids, (batch) =>
      db
        .select()
        .from(recommendationScoreFactors)
        .where(inArray(recommendationScoreFactors.recommendationId, batch)),
    ),
  ]);
  const auditByRecommendation = groupByRecommendation(auditRows);
  const citationByRecommendation = groupByRecommendation(citationRows);
  const factorsByRecommendation = groupByRecommendation(factorRows);

  const items: RecommendationItem[] = recommendationRows.map((row) => ({
    id: row.id,
    category: row.category,
    ruleKey: row.ruleKey,
    generatorVersion: row.generatorVersion,
    targetKind: row.targetKind,
    targetUrl: row.targetUrl,
    targetHostname: row.targetHostname,
    targetLabel: row.targetLabel,
    targetCommunity: row.targetCommunity,
    title: row.title,
    action: row.action,
    rationale: row.rationale,
    status: row.status,
    isActive: row.isActive,
    priorityLevel: row.priorityLevel,
    priorityScore: row.priorityScore,
    scoreVersion: row.scoreVersion,
    evidenceWindowStart: row.evidenceWindowStart,
    evidenceWindowEnd: row.evidenceWindowEnd,
    evidenceAsOf: row.evidenceAsOf,
    occurrenceCount: row.occurrenceCount,
    affectedPageCount: row.affectedPageCount,
    citationCount: row.citationCount,
    answerCount: row.answerCount,
    promptCount: row.promptCount,
    targetBrandCitationCount: row.targetBrandCitationCount,
    competitorCount: row.competitorCount,
    firstObservedAt: row.firstObservedAt,
    lastObservedAt: row.lastObservedAt,
    createdAt: row.createdAt,
    lastGeneratedAt: row.lastGeneratedAt,
    updatedAt: row.updatedAt,
    doneAt: row.doneAt,
    declinedAt: row.declinedAt,
    scoreFactors: (factorsByRecommendation.get(row.id) ?? [])
      .map((factor) => ({
        factorKey: factor.factorKey,
        label: factor.label,
        rawValue: factor.rawValue,
        weight: factor.weight,
        contribution: factor.contribution,
        explanation: factor.explanation,
      }))
      .toSorted((a, b) => b.weight - a.weight),
    auditEvidence: (auditByRecommendation.get(row.id) ?? []).map(
      (evidence) => ({
        id: evidence.id,
        auditIssueId: evidence.auditIssueId,
        sourceAuditId: evidence.sourceAuditId,
        issueType: evidence.issueType,
        severity: evidence.severity,
        pageUrl: evidence.pageUrl,
        detailsJson: evidence.detailsJson,
      }),
    ),
    citationEvidence: (citationByRecommendation.get(row.id) ?? []).map(
      (evidence) => ({
        id: evidence.id,
        citationId: evidence.citationId,
        competitorBrandId: evidence.competitorBrandId,
        sourceAnswerId: evidence.sourceAnswerId,
        sourceUrl: evidence.sourceUrl,
        sourceHostname: evidence.sourceHostname,
        sourceTitle: evidence.sourceTitle,
        promptText: evidence.promptText,
        model: evidence.model,
        observedAt: evidence.observedAt,
        competitorBrandName: evidence.competitorBrandName,
      }),
    ),
  }));
  return {
    generatedAt:
      recommendationRows
        .map((row) => row.lastGeneratedAt)
        .toSorted((a, b) => b.localeCompare(a))[0] ?? null,
    items,
  };
}

async function updateStatus(input: {
  projectId: string;
  recommendationId: string;
  status: RecommendationStatus;
  now: string;
}): Promise<boolean> {
  const timestamps =
    input.status === "done"
      ? { doneAt: input.now, declinedAt: null }
      : input.status === "declined"
        ? { doneAt: null, declinedAt: input.now }
        : { doneAt: null, declinedAt: null };
  const rows = await db
    .update(recommendations)
    .set({
      status: input.status,
      updatedAt: input.now,
      ...timestamps,
    })
    .where(
      and(
        eq(recommendations.id, input.recommendationId),
        eq(recommendations.projectId, input.projectId),
      ),
    )
    .returning({ id: recommendations.id });
  return rows.length > 0;
}

async function readInBatches<Row>(
  ids: string[],
  read: (ids: string[]) => Promise<Row[]>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let index = 0; index < ids.length; index += READ_BATCH_SIZE) {
    const batch = ids.slice(index, index + READ_BATCH_SIZE);
    if (batch.length > 0) rows.push(...(await read(batch)));
  }
  return rows;
}

function groupByRecommendation<Row extends { recommendationId: string }>(
  rows: Row[],
): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    grouped.set(row.recommendationId, [
      ...(grouped.get(row.recommendationId) ?? []),
      row,
    ]);
  }
  return grouped;
}

export const RecommendationRepository = {
  upsertCandidate,
  markNotGeneratedInactive,
  listQueue,
  updateStatus,
} as const;
