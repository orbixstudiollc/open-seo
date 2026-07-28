import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  aiAnswers,
  aiBrandMentions,
  aiBrands,
  aiCitations,
  aiDomainClassifications,
  aiRuns,
} from "@/db/schema";

export type CitationIntelligenceRunRow = {
  id: string;
  startedAt: string;
};

export type CitationIntelligenceAnswerRow = {
  id: string;
  runId: string;
  runStartedAt: string;
  status: "success" | "error";
};

export type CitationIntelligenceCitationRow = {
  answerId: string;
  citationOrder: number;
  url: string;
  title: string | null;
};

export type CitationIntelligenceMentionRow = {
  answerId: string;
  brandId: string | null;
  mentionCount: number;
};

export type CitationIntelligenceBrandRow = {
  id: string;
  name: string;
  normalizedName: string;
  domain: string | null;
  isPrimary: boolean;
  createdAt: string;
  archivedAt: string | null;
};

export type CitationClassificationRow = {
  domain: string;
  matchScope: "hostname" | "registrable_domain";
  domainType:
    | "editorial"
    | "corporate"
    | "ugc"
    | "reference"
    | "institutional"
    | "other";
  method: "manual" | "curated_rule" | "model_suggestion";
  ruleVersion: string;
  confidence: number | null;
  reviewedAt: string | null;
};

const ID_BATCH_SIZE = 80;
const TERMINAL_RUN_STATUSES = ["completed", "partial", "failed"] as const;
const TERMINAL_ANSWER_STATUSES = ["success", "error"] as const;
type TerminalAnswerStatus = (typeof TERMINAL_ANSWER_STATUSES)[number];

function isTerminalAnswer<Row extends { status: string }>(
  row: Row,
): row is Row & { status: TerminalAnswerStatus } {
  return (TERMINAL_ANSWER_STATUSES as readonly string[]).includes(row.status);
}

async function getRunsWithAnswers(
  projectId: string,
): Promise<CitationIntelligenceRunRow[]> {
  return db
    .selectDistinct({
      id: aiRuns.id,
      startedAt: aiRuns.startedAt,
    })
    .from(aiRuns)
    .innerJoin(aiAnswers, eq(aiAnswers.runId, aiRuns.id))
    .where(
      and(
        eq(aiRuns.projectId, projectId),
        inArray(aiRuns.status, TERMINAL_RUN_STATUSES),
      ),
    )
    .orderBy(asc(aiRuns.startedAt));
}

async function getAnswers(
  runIds: string[],
): Promise<CitationIntelligenceAnswerRow[]> {
  const rows: CitationIntelligenceAnswerRow[] = [];
  for (let index = 0; index < runIds.length; index += ID_BATCH_SIZE) {
    const ids = runIds.slice(index, index + ID_BATCH_SIZE);
    if (ids.length === 0) continue;
    rows.push(
      ...(
        await db
          .select({
            id: aiAnswers.id,
            runId: aiAnswers.runId,
            runStartedAt: aiRuns.startedAt,
            status: aiAnswers.status,
          })
          .from(aiAnswers)
          .innerJoin(aiRuns, eq(aiRuns.id, aiAnswers.runId))
          .where(
            and(
              inArray(aiAnswers.runId, ids),
              inArray(aiAnswers.status, [...TERMINAL_ANSWER_STATUSES]),
            ),
          )
          .orderBy(asc(aiRuns.startedAt), asc(aiAnswers.id))
      ).filter(isTerminalAnswer),
    );
  }
  return rows;
}

async function getCitations(
  answerIds: string[],
): Promise<CitationIntelligenceCitationRow[]> {
  const rows: CitationIntelligenceCitationRow[] = [];
  for (let index = 0; index < answerIds.length; index += ID_BATCH_SIZE) {
    const ids = answerIds.slice(index, index + ID_BATCH_SIZE);
    if (ids.length === 0) continue;
    rows.push(
      ...(await db
        .select({
          answerId: aiCitations.answerId,
          citationOrder: aiCitations.citationOrder,
          url: aiCitations.url,
          title: aiCitations.title,
        })
        .from(aiCitations)
        .where(inArray(aiCitations.answerId, ids))
        .orderBy(asc(aiCitations.answerId), asc(aiCitations.citationOrder))),
    );
  }
  return rows;
}

async function getMentions(
  answerIds: string[],
): Promise<CitationIntelligenceMentionRow[]> {
  const rows: CitationIntelligenceMentionRow[] = [];
  for (let index = 0; index < answerIds.length; index += ID_BATCH_SIZE) {
    const ids = answerIds.slice(index, index + ID_BATCH_SIZE);
    if (ids.length === 0) continue;
    rows.push(
      ...(await db
        .select({
          answerId: aiBrandMentions.answerId,
          brandId: aiBrandMentions.brandId,
          mentionCount: aiBrandMentions.mentionCount,
        })
        .from(aiBrandMentions)
        .where(inArray(aiBrandMentions.answerId, ids))
        .orderBy(asc(aiBrandMentions.answerId))),
    );
  }
  return rows;
}

async function getBrands(
  projectId: string,
): Promise<CitationIntelligenceBrandRow[]> {
  return db
    .select({
      id: aiBrands.id,
      name: aiBrands.name,
      normalizedName: aiBrands.normalizedName,
      domain: aiBrands.domain,
      isPrimary: aiBrands.isPrimary,
      createdAt: aiBrands.createdAt,
      archivedAt: aiBrands.archivedAt,
    })
    .from(aiBrands)
    .where(eq(aiBrands.projectId, projectId))
    .orderBy(asc(aiBrands.createdAt));
}

async function getClassifications(
  projectId: string,
): Promise<CitationClassificationRow[]> {
  return db
    .select({
      domain: aiDomainClassifications.domain,
      matchScope: aiDomainClassifications.matchScope,
      domainType: aiDomainClassifications.domainType,
      method: aiDomainClassifications.method,
      ruleVersion: aiDomainClassifications.ruleVersion,
      confidence: aiDomainClassifications.confidence,
      reviewedAt: aiDomainClassifications.reviewedAt,
    })
    .from(aiDomainClassifications)
    .where(eq(aiDomainClassifications.projectId, projectId))
    .orderBy(
      asc(aiDomainClassifications.domain),
      asc(aiDomainClassifications.matchScope),
    );
}

export const AiCitationIntelligenceRepository = {
  getRunsWithAnswers,
  getAnswers,
  getCitations,
  getMentions,
  getBrands,
  getClassifications,
};
