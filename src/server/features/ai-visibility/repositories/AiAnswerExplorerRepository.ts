import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  aiAnswers,
  aiBrandMentions,
  aiBrands,
  aiCitations,
  aiPromptSetModels,
  aiPromptSets,
  aiRuns,
  aiTrackedPrompts,
} from "@/db/schema";

const TERMINAL_RUN_STATUSES = ["completed", "partial", "failed"] as const;
const ID_BATCH_SIZE = 80;

async function getRunnablePrompts(projectId: string) {
  return db
    .select({
      promptSetId: aiPromptSets.id,
      promptSetName: aiPromptSets.name,
      trackedPromptId: aiTrackedPrompts.id,
      promptText: aiTrackedPrompts.prompt,
      model: aiPromptSetModels.model,
    })
    .from(aiTrackedPrompts)
    .innerJoin(aiPromptSets, eq(aiPromptSets.id, aiTrackedPrompts.promptSetId))
    .innerJoin(
      aiPromptSetModels,
      eq(aiPromptSetModels.promptSetId, aiPromptSets.id),
    )
    .where(
      and(
        eq(aiPromptSets.projectId, projectId),
        eq(aiPromptSets.isActive, true),
        isNull(aiPromptSets.archivedAt),
        isNull(aiTrackedPrompts.archivedAt),
      ),
    )
    .orderBy(
      asc(aiPromptSets.createdAt),
      asc(aiTrackedPrompts.sortOrder),
      asc(aiTrackedPrompts.createdAt),
      asc(aiPromptSetModels.model),
    );
}

async function getAnswers(input: {
  projectId: string;
  answerId?: string;
  trackedPromptId?: string;
  model?: string;
  limit: number;
  offset: number;
}) {
  const conditions: SQL[] = [
    eq(aiRuns.projectId, input.projectId),
    inArray(aiRuns.status, [...TERMINAL_RUN_STATUSES]),
    eq(aiAnswers.status, "success"),
    isNotNull(aiAnswers.responseText),
  ];
  if (input.answerId) conditions.push(eq(aiAnswers.id, input.answerId));
  if (input.trackedPromptId) {
    conditions.push(eq(aiAnswers.trackedPromptId, input.trackedPromptId));
  }
  if (input.model) conditions.push(eq(aiAnswers.model, input.model));

  const where = and(...conditions);
  const [totalRows, rows] = await Promise.all([
    db
      .select({ value: count(aiAnswers.id) })
      .from(aiAnswers)
      .innerJoin(aiRuns, eq(aiRuns.id, aiAnswers.runId))
      .where(where),
    db
      .select({
        id: aiAnswers.id,
        runId: aiAnswers.runId,
        promptSetId: aiRuns.promptSetId,
        trackedPromptId: aiAnswers.trackedPromptId,
        promptText: aiAnswers.promptText,
        model: aiAnswers.model,
        modelName: aiAnswers.modelName,
        responseText: aiAnswers.responseText,
        observedAt: aiAnswers.observedAt,
      })
      .from(aiAnswers)
      .innerJoin(aiRuns, eq(aiRuns.id, aiAnswers.runId))
      .where(where)
      .orderBy(desc(aiAnswers.observedAt), desc(aiAnswers.id))
      .limit(input.limit)
      .offset(input.offset),
  ]);

  return { total: totalRows[0]?.value ?? 0, rows };
}

async function getMentions(answerIds: string[]) {
  if (answerIds.length === 0) return [];
  return db
    .select({
      id: aiBrandMentions.id,
      answerId: aiBrandMentions.answerId,
      brandId: aiBrandMentions.brandId,
      brandName: aiBrands.name,
      rawName: aiBrandMentions.rawName,
      mentionCount: aiBrandMentions.mentionCount,
      sentiment: aiBrandMentions.sentiment,
      position: aiBrandMentions.position,
      start: aiBrandMentions.firstOccurrenceStart,
      end: aiBrandMentions.firstOccurrenceEnd,
    })
    .from(aiBrandMentions)
    .leftJoin(aiBrands, eq(aiBrands.id, aiBrandMentions.brandId))
    .where(inArray(aiBrandMentions.answerId, answerIds))
    .orderBy(
      asc(aiBrandMentions.answerId),
      asc(aiBrandMentions.firstOccurrenceStart),
      asc(aiBrandMentions.id),
    );
}

async function getCitations(answerIds: string[]) {
  const rows = [];
  for (let index = 0; index < answerIds.length; index += ID_BATCH_SIZE) {
    const ids = answerIds.slice(index, index + ID_BATCH_SIZE);
    if (ids.length === 0) continue;
    rows.push(
      ...(await db
        .select({
          id: aiCitations.id,
          answerId: aiCitations.answerId,
          order: aiCitations.citationOrder,
          url: aiCitations.url,
          domain: aiCitations.domain,
          title: aiCitations.title,
        })
        .from(aiCitations)
        .where(inArray(aiCitations.answerId, ids))
        .orderBy(asc(aiCitations.answerId), asc(aiCitations.citationOrder))),
    );
  }
  return rows;
}

export const AiAnswerExplorerRepository = {
  getRunnablePrompts,
  getAnswers,
  getMentions,
  getCitations,
};
