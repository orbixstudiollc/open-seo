/* eslint-disable max-lines */
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  type InferInsertModel,
} from "drizzle-orm";
import type { db as providerDb } from "@/db";
import {
  aiAnswers,
  aiBrandAliases,
  aiBrandMentions,
  aiBrands,
  aiCitations,
  aiPromptSetModels,
  aiPromptSets,
  aiPromptTagAssignments,
  aiPromptTags,
  aiPromptTopics,
  aiRuns,
  aiTrackedPrompts,
} from "@/db/ai-visibility.schema";
import {
  aiVisibilityModelSchema,
  aiVisibilityRetentionCutoff,
} from "@/shared/ai-visibility";

const tables = {
  aiPromptSets,
  aiPromptSetModels,
  aiPromptTopics,
  aiTrackedPrompts,
  aiPromptTags,
  aiPromptTagAssignments,
  aiBrands,
  aiBrandAliases,
  aiRuns,
  aiAnswers,
  aiBrandMentions,
  aiCitations,
};

export type AiVisibilityRepositoryDatabase = typeof providerDb;
export type AiVisibilityRepositoryTables = typeof tables;

type PromptSetInsert = InferInsertModel<typeof aiPromptSets>;
type PromptSetRecord = typeof aiPromptSets.$inferSelect;
type TopicInsert = InferInsertModel<typeof aiPromptTopics>;
type TopicRecord = typeof aiPromptTopics.$inferSelect;
type TrackedPromptInsert = InferInsertModel<typeof aiTrackedPrompts>;
type TrackedPromptRecord = typeof aiTrackedPrompts.$inferSelect;
type TagInsert = InferInsertModel<typeof aiPromptTags>;
type TagRecord = typeof aiPromptTags.$inferSelect;
type BrandInsert = InferInsertModel<typeof aiBrands>;
type BrandRecord = typeof aiBrands.$inferSelect;
type BrandAliasInsert = InferInsertModel<typeof aiBrandAliases>;
type BrandAliasRecord = typeof aiBrandAliases.$inferSelect;
type RunInsert = InferInsertModel<typeof aiRuns>;
type RunRecord = typeof aiRuns.$inferSelect;
type AnswerInsert = InferInsertModel<typeof aiAnswers>;
type AnswerRecord = typeof aiAnswers.$inferSelect;
type BrandMentionInsert = Omit<
  InferInsertModel<typeof aiBrandMentions>,
  "id" | "createdAt"
>;
type BrandMentionRecord = typeof aiBrandMentions.$inferSelect;
type CitationInsert = Omit<
  InferInsertModel<typeof aiCitations>,
  "id" | "createdAt"
>;
type CitationRecord = typeof aiCitations.$inferSelect;

type AiVisibilityRepositoryContract = {
  createPromptSet: (values: PromptSetInsert) => Promise<PromptSetRecord>;
  addPromptSetModels: (promptSetId: string, models: string[]) => Promise<void>;
  createTopic: (values: TopicInsert) => Promise<TopicRecord>;
  createTrackedPrompt: (
    values: TrackedPromptInsert,
  ) => Promise<TrackedPromptRecord>;
  createTag: (values: TagInsert) => Promise<TagRecord>;
  assignTag: (trackedPromptId: string, tagId: string) => Promise<void>;
  createBrand: (values: BrandInsert) => Promise<BrandRecord>;
  createBrandAlias: (values: BrandAliasInsert) => Promise<BrandAliasRecord>;
  getPromptSetsForProject: (projectId: string) => Promise<PromptSetRecord[]>;
  getPromptSetDefinition: (promptSetId: string) => Promise<{
    promptSet: PromptSetRecord;
    models: (typeof aiPromptSetModels.$inferSelect)[];
    topics: TopicRecord[];
    prompts: TrackedPromptRecord[];
    tags: TagRecord[];
    assignments: Array<{ trackedPromptId: string; tagId: string }>;
  } | null>;
  getBrandRegistry: (projectId: string) => Promise<{
    brands: BrandRecord[];
    aliases: BrandAliasRecord[];
  }>;
  getRunsForProject: (
    projectId: string,
    limit?: number,
  ) => Promise<RunRecord[]>;
  tryCreateRun: (values: {
    id: string;
    promptSetId: string;
    projectId: string;
    trigger?: "scheduled" | "manual";
    promptsTotal?: number;
    answersExpected?: number;
    startedAt?: string;
  }) => Promise<boolean>;
  updateRun: (runId: string, values: Partial<RunInsert>) => Promise<void>;
  createAnswer: (values: AnswerInsert) => Promise<AnswerRecord>;
  insertBrandMentions: (values: BrandMentionInsert[]) => Promise<void>;
  insertCitations: (values: CitationInsert[]) => Promise<void>;
  getRunWithObservations: (runId: string) => Promise<{
    run: RunRecord;
    answers: AnswerRecord[];
    mentions: BrandMentionRecord[];
    citations: CitationRecord[];
  } | null>;
  pruneTerminalRunsBefore: (params: {
    cutoff: string;
    projectId?: string;
    limit?: number;
  }) => Promise<number>;
  pruneExpiredTerminalRuns: (params?: {
    now?: Date;
    projectId?: string;
    limit?: number;
  }) => Promise<number>;
};

const OBSERVATION_INSERT_SIZE = 10;
const RETENTION_DELETE_SIZE = 90;

/**
 * The factory keeps one repository implementation testable against both
 * dialect drivers. Production uses the provider-aware defaults below.
 */
// eslint-disable-next-line max-lines-per-function -- one flat factory keeps the dual-dialect repository implementation identical and injectable.
export function createAiVisibilityRepository(
  database: AiVisibilityRepositoryDatabase,
  schema: AiVisibilityRepositoryTables = tables,
): AiVisibilityRepositoryContract {
  async function createPromptSet(values: PromptSetInsert) {
    const [row] = await database
      .insert(schema.aiPromptSets)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create AI prompt set");
    return row;
  }

  async function addPromptSetModels(promptSetId: string, models: string[]) {
    if (models.length === 0) return;
    const validatedModels = models.map((model) =>
      aiVisibilityModelSchema.parse(model),
    );
    await database
      .insert(schema.aiPromptSetModels)
      .values(validatedModels.map((model) => ({ promptSetId, model })))
      .onConflictDoNothing({
        target: [
          schema.aiPromptSetModels.promptSetId,
          schema.aiPromptSetModels.model,
        ],
      });
  }

  async function createTopic(values: TopicInsert) {
    const [row] = await database
      .insert(schema.aiPromptTopics)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create AI prompt topic");
    return row;
  }

  async function createTrackedPrompt(values: TrackedPromptInsert) {
    const [row] = await database
      .insert(schema.aiTrackedPrompts)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create tracked AI prompt");
    return row;
  }

  async function createTag(values: TagInsert) {
    const [row] = await database
      .insert(schema.aiPromptTags)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create AI prompt tag");
    return row;
  }

  async function assignTag(trackedPromptId: string, tagId: string) {
    await database
      .insert(schema.aiPromptTagAssignments)
      .values({ trackedPromptId, tagId })
      .onConflictDoNothing({
        target: [
          schema.aiPromptTagAssignments.trackedPromptId,
          schema.aiPromptTagAssignments.tagId,
        ],
      });
  }

  async function createBrand(values: BrandInsert) {
    const [row] = await database
      .insert(schema.aiBrands)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create AI brand");
    return row;
  }

  async function createBrandAlias(values: BrandAliasInsert) {
    const [brand] = await database
      .select({ id: schema.aiBrands.id })
      .from(schema.aiBrands)
      .where(
        and(
          eq(schema.aiBrands.id, values.brandId),
          eq(schema.aiBrands.projectId, values.projectId),
        ),
      )
      .limit(1);
    if (!brand) {
      throw new Error("AI brand alias must belong to the brand's project");
    }

    const [row] = await database
      .insert(schema.aiBrandAliases)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create AI brand alias");
    return row;
  }

  async function getPromptSetsForProject(projectId: string) {
    return database
      .select()
      .from(schema.aiPromptSets)
      .where(eq(schema.aiPromptSets.projectId, projectId))
      .orderBy(asc(schema.aiPromptSets.createdAt));
  }

  async function getPromptSetDefinition(promptSetId: string) {
    const [promptSetRows, models, topics, prompts, tags, assignments] =
      await Promise.all([
        database
          .select()
          .from(schema.aiPromptSets)
          .where(eq(schema.aiPromptSets.id, promptSetId))
          .limit(1),
        database
          .select()
          .from(schema.aiPromptSetModels)
          .where(eq(schema.aiPromptSetModels.promptSetId, promptSetId))
          .orderBy(schema.aiPromptSetModels.model),
        database
          .select()
          .from(schema.aiPromptTopics)
          .where(eq(schema.aiPromptTopics.promptSetId, promptSetId))
          .orderBy(schema.aiPromptTopics.createdAt),
        database
          .select()
          .from(schema.aiTrackedPrompts)
          .where(eq(schema.aiTrackedPrompts.promptSetId, promptSetId))
          .orderBy(
            schema.aiTrackedPrompts.sortOrder,
            schema.aiTrackedPrompts.createdAt,
          ),
        database
          .select()
          .from(schema.aiPromptTags)
          .where(eq(schema.aiPromptTags.promptSetId, promptSetId))
          .orderBy(schema.aiPromptTags.createdAt),
        database
          .select({
            trackedPromptId: schema.aiPromptTagAssignments.trackedPromptId,
            tagId: schema.aiPromptTagAssignments.tagId,
          })
          .from(schema.aiPromptTagAssignments)
          .innerJoin(
            schema.aiTrackedPrompts,
            eq(
              schema.aiPromptTagAssignments.trackedPromptId,
              schema.aiTrackedPrompts.id,
            ),
          )
          .where(eq(schema.aiTrackedPrompts.promptSetId, promptSetId)),
      ]);

    const promptSet = promptSetRows[0];
    if (!promptSet) return null;
    return { promptSet, models, topics, prompts, tags, assignments };
  }

  async function getBrandRegistry(projectId: string) {
    const [brands, aliases] = await Promise.all([
      database
        .select()
        .from(schema.aiBrands)
        .where(eq(schema.aiBrands.projectId, projectId))
        .orderBy(schema.aiBrands.createdAt),
      database
        .select()
        .from(schema.aiBrandAliases)
        .where(eq(schema.aiBrandAliases.projectId, projectId))
        .orderBy(schema.aiBrandAliases.createdAt),
    ]);
    return { brands, aliases };
  }

  async function getRunsForProject(projectId: string, limit = 20) {
    return database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.projectId, projectId))
      .orderBy(desc(schema.aiRuns.startedAt))
      .limit(Math.min(Math.max(limit, 1), 50));
  }

  async function tryCreateRun(values: {
    id: string;
    promptSetId: string;
    projectId: string;
    trigger?: "scheduled" | "manual";
    promptsTotal?: number;
    answersExpected?: number;
    startedAt?: string;
  }): Promise<boolean> {
    const inserted = await database
      .insert(schema.aiRuns)
      .values({ ...values, status: "pending" })
      .onConflictDoNothing()
      .returning({ id: schema.aiRuns.id });
    return inserted.length > 0;
  }

  async function updateRun(runId: string, values: Partial<RunInsert>) {
    await database
      .update(schema.aiRuns)
      .set(values)
      .where(eq(schema.aiRuns.id, runId));
  }

  async function createAnswer(values: AnswerInsert) {
    const model = aiVisibilityModelSchema.parse(values.model);
    await database
      .insert(schema.aiAnswers)
      .values({ ...values, model })
      .onConflictDoNothing({
        target: [
          schema.aiAnswers.runId,
          schema.aiAnswers.trackedPromptId,
          schema.aiAnswers.model,
        ],
      });

    const [row] = await database
      .select()
      .from(schema.aiAnswers)
      .where(
        and(
          eq(schema.aiAnswers.runId, values.runId),
          eq(schema.aiAnswers.trackedPromptId, values.trackedPromptId),
          eq(schema.aiAnswers.model, model),
        ),
      )
      .limit(1);
    if (!row) throw new Error("Failed to create AI answer");
    return row;
  }

  async function insertBrandMentions(values: BrandMentionInsert[]) {
    for (let i = 0; i < values.length; i += OBSERVATION_INSERT_SIZE) {
      await database
        .insert(schema.aiBrandMentions)
        .values(values.slice(i, i + OBSERVATION_INSERT_SIZE))
        .onConflictDoNothing({
          target: [
            schema.aiBrandMentions.answerId,
            schema.aiBrandMentions.normalizedName,
          ],
        });
    }
  }

  async function insertCitations(values: CitationInsert[]) {
    for (let i = 0; i < values.length; i += OBSERVATION_INSERT_SIZE) {
      await database
        .insert(schema.aiCitations)
        .values(values.slice(i, i + OBSERVATION_INSERT_SIZE))
        .onConflictDoNothing({
          target: [schema.aiCitations.answerId, schema.aiCitations.url],
        });
    }
  }

  async function getRunWithObservations(runId: string) {
    const [run] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, runId))
      .limit(1);
    if (!run) return null;

    const answers = await database
      .select()
      .from(schema.aiAnswers)
      .where(eq(schema.aiAnswers.runId, runId))
      .orderBy(schema.aiAnswers.observedAt);
    const answerIds = answers.map((answer) => answer.id);
    const mentions = [];
    const citations = [];
    for (let i = 0; i < answerIds.length; i += RETENTION_DELETE_SIZE) {
      const ids = answerIds.slice(i, i + RETENTION_DELETE_SIZE);
      if (ids.length === 0) continue;
      mentions.push(
        ...(await database
          .select()
          .from(schema.aiBrandMentions)
          .where(inArray(schema.aiBrandMentions.answerId, ids))
          .orderBy(schema.aiBrandMentions.id)),
      );
      citations.push(
        ...(await database
          .select()
          .from(schema.aiCitations)
          .where(inArray(schema.aiCitations.answerId, ids))
          .orderBy(
            schema.aiCitations.answerId,
            schema.aiCitations.citationOrder,
          )),
      );
    }
    return { run, answers, mentions, citations };
  }

  /**
   * Delete one bounded batch of terminal runs. Cascades remove answer text,
   * mentions, and citations; mutable configuration and registries are retained.
   */
  async function pruneTerminalRunsBefore(params: {
    cutoff: string;
    projectId?: string;
    limit?: number;
  }): Promise<number> {
    const conditions = [
      inArray(schema.aiRuns.status, ["completed", "partial", "failed"]),
      isNotNull(schema.aiRuns.completedAt),
      lt(schema.aiRuns.completedAt, params.cutoff),
    ];
    if (params.projectId) {
      conditions.push(eq(schema.aiRuns.projectId, params.projectId));
    }

    const rows = await database
      .select({ id: schema.aiRuns.id })
      .from(schema.aiRuns)
      .where(and(...conditions))
      .orderBy(asc(schema.aiRuns.completedAt))
      .limit(
        Math.min(
          Math.max(params.limit ?? RETENTION_DELETE_SIZE, 1),
          RETENTION_DELETE_SIZE,
        ),
      );
    if (rows.length === 0) return 0;

    await database.delete(schema.aiRuns).where(
      inArray(
        schema.aiRuns.id,
        rows.map((row) => row.id),
      ),
    );
    return rows.length;
  }

  async function pruneExpiredTerminalRuns(
    params: {
      now?: Date;
      projectId?: string;
      limit?: number;
    } = {},
  ) {
    return pruneTerminalRunsBefore({
      cutoff: aiVisibilityRetentionCutoff(params.now),
      projectId: params.projectId,
      limit: params.limit,
    });
  }

  return {
    createPromptSet,
    addPromptSetModels,
    createTopic,
    createTrackedPrompt,
    createTag,
    assignTag,
    createBrand,
    createBrandAlias,
    getPromptSetsForProject,
    getPromptSetDefinition,
    getBrandRegistry,
    getRunsForProject,
    tryCreateRun,
    updateRun,
    createAnswer,
    insertBrandMentions,
    insertCitations,
    getRunWithObservations,
    pruneTerminalRunsBefore,
    pruneExpiredTerminalRuns,
  };
}
