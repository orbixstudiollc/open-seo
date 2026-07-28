import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  aiAnswers,
  aiBrandMentions,
  aiBrands,
  aiPromptTopics,
  aiRuns,
  aiTrackedPrompts,
} from "@/db/schema";

export type AnalyticsRunRow = {
  id: string;
  startedAt: string;
  answersExpected: number;
};

export type AnalyticsObservationRow = {
  runId: string;
  runStartedAt: string;
  answersExpected: number;
  answerId: string;
  trackedPromptId: string;
  promptText: string;
  model: string;
  modelName: string | null;
  answerStatus: "success" | "error";
  topicId: string | null;
  topicName: string | null;
  mentionBrandId: string | null;
  mentionCount: number | null;
};

export type AnalyticsBrandRow = {
  id: string;
  name: string;
  normalizedName: string;
  isPrimary: boolean;
  createdAt: string;
  archivedAt: string | null;
};

const RUN_ID_BATCH_SIZE = 80;
const TERMINAL_RUN_STATUSES = ["completed", "partial", "failed"] as const;
// Phase 1 introduced durable pending/running answer placeholders. Analytics
// reads only terminal answers: an in-flight tuple is not an observation.
const TERMINAL_ANSWER_STATUSES = ["success", "error"] as const;
type TerminalAnswerStatus = (typeof TERMINAL_ANSWER_STATUSES)[number];

function isTerminalObservation<Row extends { answerStatus: string }>(
  row: Row,
): row is Row & { answerStatus: TerminalAnswerStatus } {
  return (TERMINAL_ANSWER_STATUSES as readonly string[]).includes(
    row.answerStatus,
  );
}

async function getRunsWithAnswers(projectId: string) {
  return db
    .selectDistinct({
      id: aiRuns.id,
      startedAt: aiRuns.startedAt,
      answersExpected: aiRuns.answersExpected,
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

async function getObservations(runIds: string[]) {
  const rows: AnalyticsObservationRow[] = [];
  for (let index = 0; index < runIds.length; index += RUN_ID_BATCH_SIZE) {
    const ids = runIds.slice(index, index + RUN_ID_BATCH_SIZE);
    if (ids.length === 0) continue;
    rows.push(
      ...(
        await db
          .select({
            runId: aiRuns.id,
            runStartedAt: aiRuns.startedAt,
            answersExpected: aiRuns.answersExpected,
            answerId: aiAnswers.id,
            trackedPromptId: aiAnswers.trackedPromptId,
            promptText: aiAnswers.promptText,
            model: aiAnswers.model,
            modelName: aiAnswers.modelName,
            answerStatus: aiAnswers.status,
            topicId: aiPromptTopics.id,
            topicName: aiPromptTopics.name,
            mentionBrandId: aiBrandMentions.brandId,
            mentionCount: aiBrandMentions.mentionCount,
          })
          .from(aiRuns)
          .innerJoin(aiAnswers, eq(aiAnswers.runId, aiRuns.id))
          .leftJoin(
            aiTrackedPrompts,
            eq(aiTrackedPrompts.id, aiAnswers.trackedPromptId),
          )
          .leftJoin(
            aiPromptTopics,
            eq(aiPromptTopics.id, aiTrackedPrompts.topicId),
          )
          .leftJoin(aiBrandMentions, eq(aiBrandMentions.answerId, aiAnswers.id))
          .where(
            and(
              inArray(aiRuns.id, ids),
              inArray(aiAnswers.status, [...TERMINAL_ANSWER_STATUSES]),
            ),
          )
          .orderBy(asc(aiRuns.startedAt), asc(aiAnswers.id))
      ).filter(isTerminalObservation),
    );
  }
  return rows;
}

async function getBrands(projectId: string) {
  return db
    .select({
      id: aiBrands.id,
      name: aiBrands.name,
      normalizedName: aiBrands.normalizedName,
      isPrimary: aiBrands.isPrimary,
      createdAt: aiBrands.createdAt,
      archivedAt: aiBrands.archivedAt,
    })
    .from(aiBrands)
    .where(eq(aiBrands.projectId, projectId))
    .orderBy(asc(aiBrands.createdAt));
}

export const AiVisibilityAnalyticsRepository = {
  getRunsWithAnswers,
  getObservations,
  getBrands,
};
