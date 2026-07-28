/* eslint-disable max-lines */
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  isNotNull,
  lt,
  lte,
  or,
  sql,
  type InferInsertModel,
} from "drizzle-orm";
import type { db as providerDb } from "@/db";
import { projects } from "@/db/app.schema";
import {
  aiAnswers,
  aiBrandAliases,
  aiBrandMentions,
  aiBrands,
  aiCitations,
  aiMentionScoringAttempts,
  aiProjectRunSettings,
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
  projects,
  aiProjectRunSettings,
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
  aiMentionScoringAttempts,
  aiCitations,
};

export type AiVisibilityRepositoryDatabase = typeof providerDb;
export type AiVisibilityRepositoryTables = typeof tables;

type PromptSetInsert = InferInsertModel<typeof aiPromptSets>;
type PromptSetRecord = typeof aiPromptSets.$inferSelect;
type ProjectRunSettingsInsert = InferInsertModel<typeof aiProjectRunSettings>;
type ProjectRunSettingsRecord = typeof aiProjectRunSettings.$inferSelect;
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
type MentionScoringAttemptInsert = InferInsertModel<
  typeof aiMentionScoringAttempts
>;
type MentionScoringAttemptRecord = typeof aiMentionScoringAttempts.$inferSelect;
type CitationInsert = Omit<
  InferInsertModel<typeof aiCitations>,
  "id" | "createdAt"
>;
type CitationRecord = typeof aiCitations.$inferSelect;

type AiVisibilityRepositoryContract = {
  getOrCreateProjectRunSettings: (
    projectId: string,
  ) => Promise<ProjectRunSettingsRecord>;
  updateProjectRunSettings: (
    projectId: string,
    values: Partial<ProjectRunSettingsInsert>,
  ) => Promise<ProjectRunSettingsRecord>;
  reserveProjectAnswerCalls: (values: {
    projectId: string;
    calls: number;
    windowStartedAt: string;
    now: string;
  }) => Promise<{
    reserved: boolean;
    settings: ProjectRunSettingsRecord;
  }>;
  createPromptSet: (values: PromptSetInsert) => Promise<PromptSetRecord>;
  updatePromptSet: (
    promptSetId: string,
    projectId: string,
    values: Partial<PromptSetInsert>,
  ) => Promise<PromptSetRecord | null>;
  addPromptSetModels: (promptSetId: string, models: string[]) => Promise<void>;
  replacePromptSetModels: (
    promptSetId: string,
    models: string[],
  ) => Promise<void>;
  createTopic: (values: TopicInsert) => Promise<TopicRecord>;
  updateTopic: (
    topicId: string,
    promptSetId: string,
    values: Partial<TopicInsert>,
  ) => Promise<TopicRecord | null>;
  createTrackedPrompt: (
    values: TrackedPromptInsert,
  ) => Promise<TrackedPromptRecord>;
  createPromptSuggestion: (
    values: TrackedPromptInsert,
  ) => Promise<{ created: boolean; prompt: TrackedPromptRecord }>;
  updateTrackedPrompt: (
    trackedPromptId: string,
    promptSetId: string,
    values: Partial<TrackedPromptInsert>,
  ) => Promise<TrackedPromptRecord | null>;
  createTag: (values: TagInsert) => Promise<TagRecord>;
  updateTag: (
    tagId: string,
    promptSetId: string,
    values: Partial<TagInsert>,
  ) => Promise<TagRecord | null>;
  assignTag: (trackedPromptId: string, tagId: string) => Promise<void>;
  unassignTag: (trackedPromptId: string, tagId: string) => Promise<void>;
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
  getRunnablePromptSetDefinition: (promptSetId: string) => Promise<{
    promptSet: PromptSetRecord;
    models: (typeof aiPromptSetModels.$inferSelect)[];
    prompts: TrackedPromptRecord[];
  } | null>;
  getDuePromptSetsWithOrganization: (
    nowIso: string,
    limit?: number,
  ) => Promise<
    Array<
      PromptSetRecord & {
        organizationId: string;
        projectCadence: "daily" | "weekly" | "monthly" | "manual" | null;
      }
    >
  >;
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
  getRunById: (runId: string) => Promise<RunRecord | null>;
  getActiveRunForPromptSet: (promptSetId: string) => Promise<RunRecord | null>;
  createAnswer: (values: AnswerInsert) => Promise<AnswerRecord>;
  createAnswerPlaceholders: (values: AnswerInsert[]) => Promise<void>;
  claimPendingAnswer: (
    answerId: string,
    runId: string,
    attemptStartedAt: string,
  ) => Promise<boolean>;
  completeRunningAnswer: (
    answerId: string,
    runId: string,
    values: Partial<AnswerInsert>,
  ) => Promise<boolean>;
  getAnswerById: (
    answerId: string,
    runId: string,
  ) => Promise<AnswerRecord | null>;
  getAnswersForRun: (runId: string) => Promise<AnswerRecord[]>;
  insertBrandMentions: (values: BrandMentionInsert[]) => Promise<void>;
  getBrandMentionsForAnswer: (
    answerId: string,
  ) => Promise<BrandMentionRecord[]>;
  tryCreateMentionScoringAttempt: (
    values: MentionScoringAttemptInsert,
  ) => Promise<boolean>;
  getMentionScoringAttempt: (
    answerId: string,
    promptVersion: string,
  ) => Promise<MentionScoringAttemptRecord | null>;
  completeMentionScoring: (values: {
    attemptId: string;
    answerId: string;
    status: "success" | "failed" | "skipped";
    completedAt: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    costBasis: "actual" | "estimated" | "unknown";
    errorCode: string | null;
    sentiments?: Array<{
      mentionId: number;
      sentiment: "positive" | "neutral" | "negative" | null;
    }>;
  }) => Promise<void>;
  insertCitations: (values: CitationInsert[]) => Promise<void>;
  getRunWithObservations: (runId: string) => Promise<{
    run: RunRecord;
    answers: AnswerRecord[];
    mentions: BrandMentionRecord[];
    scoringAttempts: MentionScoringAttemptRecord[];
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
type AtomicBatch = (
  build: (tx: AiVisibilityRepositoryDatabase) => readonly Promise<unknown>[],
) => Promise<void>;

/**
 * The factory keeps one repository implementation testable against both
 * dialect drivers. Production uses the provider-aware defaults below.
 */
// eslint-disable-next-line max-lines-per-function -- one flat factory keeps the dual-dialect repository implementation identical and injectable.
export function createAiVisibilityRepository(
  database: AiVisibilityRepositoryDatabase,
  schema: AiVisibilityRepositoryTables = tables,
  atomicBatch?: AtomicBatch,
): AiVisibilityRepositoryContract {
  async function executeAtomically(
    build: (tx: AiVisibilityRepositoryDatabase) => readonly Promise<unknown>[],
  ) {
    if (atomicBatch) {
      await atomicBatch(build);
      return;
    }
    for (const statement of build(database)) await statement;
  }
  async function getOrCreateProjectRunSettings(projectId: string) {
    await database
      .insert(schema.aiProjectRunSettings)
      .values({ projectId })
      .onConflictDoNothing({ target: schema.aiProjectRunSettings.projectId });
    const [row] = await database
      .select()
      .from(schema.aiProjectRunSettings)
      .where(eq(schema.aiProjectRunSettings.projectId, projectId))
      .limit(1);
    if (!row) throw new Error("Failed to resolve AI project run settings");
    return row;
  }

  async function updateProjectRunSettings(
    projectId: string,
    values: Partial<ProjectRunSettingsInsert>,
  ) {
    await getOrCreateProjectRunSettings(projectId);
    const [row] = await database
      .update(schema.aiProjectRunSettings)
      .set(values)
      .where(eq(schema.aiProjectRunSettings.projectId, projectId))
      .returning();
    if (!row) throw new Error("Failed to update AI project run settings");
    return row;
  }

  async function reserveProjectAnswerCalls(values: {
    projectId: string;
    calls: number;
    windowStartedAt: string;
    now: string;
  }) {
    const existing = await getOrCreateProjectRunSettings(values.projectId);
    if (!Number.isSafeInteger(values.calls) || values.calls <= 0) {
      return { reserved: false, settings: existing };
    }

    const windowExpired = or(
      isNull(schema.aiProjectRunSettings.windowStartedAt),
      lt(schema.aiProjectRunSettings.windowStartedAt, values.windowStartedAt),
    );
    const withinCurrentWindowCap = lte(
      sql`${schema.aiProjectRunSettings.callsReserved} + ${values.calls}`,
      schema.aiProjectRunSettings.answerCallCap,
    );
    const runFitsCap = lte(
      sql`${values.calls}`,
      schema.aiProjectRunSettings.answerCallCap,
    );

    const [reserved] = await database
      .update(schema.aiProjectRunSettings)
      .set({
        windowStartedAt: sql`CASE
          WHEN ${schema.aiProjectRunSettings.windowStartedAt} IS NULL
            OR ${schema.aiProjectRunSettings.windowStartedAt} < ${values.windowStartedAt}
          THEN ${values.windowStartedAt}
          ELSE ${schema.aiProjectRunSettings.windowStartedAt}
        END`,
        callsReserved: sql`CASE
          WHEN ${schema.aiProjectRunSettings.windowStartedAt} IS NULL
            OR ${schema.aiProjectRunSettings.windowStartedAt} < ${values.windowStartedAt}
          THEN ${values.calls}
          ELSE ${schema.aiProjectRunSettings.callsReserved} + ${values.calls}
        END`,
        updatedAt: values.now,
      })
      .where(
        and(
          eq(schema.aiProjectRunSettings.projectId, values.projectId),
          runFitsCap,
          or(windowExpired, withinCurrentWindowCap),
        ),
      )
      .returning();

    if (reserved) return { reserved: true, settings: reserved };
    return {
      reserved: false,
      settings: await getOrCreateProjectRunSettings(values.projectId),
    };
  }

  async function createPromptSet(values: PromptSetInsert) {
    const [row] = await database
      .insert(schema.aiPromptSets)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create AI prompt set");
    return row;
  }

  async function updatePromptSet(
    promptSetId: string,
    projectId: string,
    values: Partial<PromptSetInsert>,
  ) {
    const [row] = await database
      .update(schema.aiPromptSets)
      .set(values)
      .where(
        and(
          eq(schema.aiPromptSets.id, promptSetId),
          eq(schema.aiPromptSets.projectId, projectId),
        ),
      )
      .returning();
    return row ?? null;
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

  async function replacePromptSetModels(promptSetId: string, models: string[]) {
    const validatedModels = Array.from(
      new Set(models.map((model) => aiVisibilityModelSchema.parse(model))),
    );
    if (validatedModels.length === 0) {
      throw new Error("A prompt set must enable at least one model");
    }
    await database
      .delete(schema.aiPromptSetModels)
      .where(eq(schema.aiPromptSetModels.promptSetId, promptSetId));
    await addPromptSetModels(promptSetId, validatedModels);
  }

  async function createTopic(values: TopicInsert) {
    const [row] = await database
      .insert(schema.aiPromptTopics)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create AI prompt topic");
    return row;
  }

  async function updateTopic(
    topicId: string,
    promptSetId: string,
    values: Partial<TopicInsert>,
  ) {
    const [row] = await database
      .update(schema.aiPromptTopics)
      .set(values)
      .where(
        and(
          eq(schema.aiPromptTopics.id, topicId),
          eq(schema.aiPromptTopics.promptSetId, promptSetId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async function createTrackedPrompt(values: TrackedPromptInsert) {
    const [row] = await database
      .insert(schema.aiTrackedPrompts)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create tracked AI prompt");
    return row;
  }

  async function createPromptSuggestion(values: TrackedPromptInsert) {
    const [created] = await database
      .insert(schema.aiTrackedPrompts)
      .values(values)
      .onConflictDoNothing({
        target: [
          schema.aiTrackedPrompts.promptSetId,
          schema.aiTrackedPrompts.normalizedPrompt,
        ],
      })
      .returning();
    if (created) return { created: true, prompt: created };

    const [existing] = await database
      .select()
      .from(schema.aiTrackedPrompts)
      .where(
        and(
          eq(schema.aiTrackedPrompts.promptSetId, values.promptSetId),
          eq(schema.aiTrackedPrompts.normalizedPrompt, values.normalizedPrompt),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Failed to resolve tracked AI suggestion");
    return { created: false, prompt: existing };
  }

  async function updateTrackedPrompt(
    trackedPromptId: string,
    promptSetId: string,
    values: Partial<TrackedPromptInsert>,
  ) {
    const [row] = await database
      .update(schema.aiTrackedPrompts)
      .set(values)
      .where(
        and(
          eq(schema.aiTrackedPrompts.id, trackedPromptId),
          eq(schema.aiTrackedPrompts.promptSetId, promptSetId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async function createTag(values: TagInsert) {
    const [row] = await database
      .insert(schema.aiPromptTags)
      .values(values)
      .returning();
    if (!row) throw new Error("Failed to create AI prompt tag");
    return row;
  }

  async function updateTag(
    tagId: string,
    promptSetId: string,
    values: Partial<TagInsert>,
  ) {
    const [row] = await database
      .update(schema.aiPromptTags)
      .set(values)
      .where(
        and(
          eq(schema.aiPromptTags.id, tagId),
          eq(schema.aiPromptTags.promptSetId, promptSetId),
        ),
      )
      .returning();
    return row ?? null;
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

  async function unassignTag(trackedPromptId: string, tagId: string) {
    await database
      .delete(schema.aiPromptTagAssignments)
      .where(
        and(
          eq(schema.aiPromptTagAssignments.trackedPromptId, trackedPromptId),
          eq(schema.aiPromptTagAssignments.tagId, tagId),
        ),
      );
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

  async function getRunnablePromptSetDefinition(promptSetId: string) {
    const definition = await getPromptSetDefinition(promptSetId);
    if (
      !definition ||
      !definition.promptSet.isActive ||
      definition.promptSet.archivedAt
    ) {
      return null;
    }
    return {
      promptSet: definition.promptSet,
      models: definition.models,
      prompts: definition.prompts.filter(
        (prompt) => prompt.state === "active" && !prompt.archivedAt,
      ),
    };
  }

  async function getDuePromptSetsWithOrganization(nowIso: string, limit = 50) {
    const rows = await database
      .select({
        promptSet: schema.aiPromptSets,
        organizationId: schema.projects.organizationId,
        projectCadence: schema.aiProjectRunSettings.cadence,
      })
      .from(schema.aiPromptSets)
      .innerJoin(
        schema.projects,
        eq(schema.aiPromptSets.projectId, schema.projects.id),
      )
      .leftJoin(
        schema.aiProjectRunSettings,
        eq(
          schema.aiPromptSets.projectId,
          schema.aiProjectRunSettings.projectId,
        ),
      )
      .where(
        and(
          eq(schema.aiPromptSets.isActive, true),
          isNull(schema.aiPromptSets.archivedAt),
          isNull(schema.projects.archivedAt),
          isNotNull(schema.aiPromptSets.nextRunAt),
          lte(schema.aiPromptSets.nextRunAt, nowIso),
        ),
      )
      .orderBy(
        asc(schema.aiPromptSets.nextRunAt),
        asc(schema.aiPromptSets.createdAt),
      )
      .limit(Math.min(Math.max(limit, 1), 50));

    return rows.map((row) => ({
      ...row.promptSet,
      organizationId: row.organizationId,
      projectCadence: row.projectCadence,
    }));
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

  async function getRunById(runId: string) {
    const [row] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, runId))
      .limit(1);
    return row ?? null;
  }

  async function getActiveRunForPromptSet(promptSetId: string) {
    const [row] = await database
      .select()
      .from(schema.aiRuns)
      .where(
        and(
          eq(schema.aiRuns.promptSetId, promptSetId),
          inArray(schema.aiRuns.status, ["pending", "running"]),
        ),
      )
      .limit(1);
    return row ?? null;
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

  async function createAnswerPlaceholders(values: AnswerInsert[]) {
    for (let i = 0; i < values.length; i += OBSERVATION_INSERT_SIZE) {
      const chunk = values
        .slice(i, i + OBSERVATION_INSERT_SIZE)
        .map((value) => ({
          ...value,
          model: aiVisibilityModelSchema.parse(value.model),
        }));
      if (chunk.length === 0) continue;
      await database
        .insert(schema.aiAnswers)
        .values(chunk)
        .onConflictDoNothing({
          target: [
            schema.aiAnswers.runId,
            schema.aiAnswers.trackedPromptId,
            schema.aiAnswers.model,
          ],
        });
    }
  }

  async function claimPendingAnswer(
    answerId: string,
    runId: string,
    attemptStartedAt: string,
  ) {
    const claimed = await database
      .update(schema.aiAnswers)
      .set({ status: "running", attemptStartedAt })
      .where(
        and(
          eq(schema.aiAnswers.id, answerId),
          eq(schema.aiAnswers.runId, runId),
          eq(schema.aiAnswers.status, "pending"),
        ),
      )
      .returning({ id: schema.aiAnswers.id });
    return claimed.length > 0;
  }

  async function completeRunningAnswer(
    answerId: string,
    runId: string,
    values: Partial<AnswerInsert>,
  ) {
    const completed = await database
      .update(schema.aiAnswers)
      .set(values)
      .where(
        and(
          eq(schema.aiAnswers.id, answerId),
          eq(schema.aiAnswers.runId, runId),
          eq(schema.aiAnswers.status, "running"),
        ),
      )
      .returning({ id: schema.aiAnswers.id });
    return completed.length > 0;
  }

  async function getAnswerById(answerId: string, runId: string) {
    const [row] = await database
      .select()
      .from(schema.aiAnswers)
      .where(
        and(
          eq(schema.aiAnswers.id, answerId),
          eq(schema.aiAnswers.runId, runId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function getAnswersForRun(runId: string) {
    return database
      .select()
      .from(schema.aiAnswers)
      .where(eq(schema.aiAnswers.runId, runId))
      .orderBy(
        asc(schema.aiAnswers.trackedPromptId),
        asc(schema.aiAnswers.model),
      );
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

  async function getBrandMentionsForAnswer(answerId: string) {
    return database
      .select()
      .from(schema.aiBrandMentions)
      .where(eq(schema.aiBrandMentions.answerId, answerId))
      .orderBy(schema.aiBrandMentions.position, schema.aiBrandMentions.id);
  }

  async function tryCreateMentionScoringAttempt(
    values: MentionScoringAttemptInsert,
  ) {
    const inserted = await database
      .insert(schema.aiMentionScoringAttempts)
      .values(values)
      .onConflictDoNothing({
        target: [
          schema.aiMentionScoringAttempts.answerId,
          schema.aiMentionScoringAttempts.promptVersion,
        ],
      })
      .returning({ id: schema.aiMentionScoringAttempts.id });
    return inserted.length > 0;
  }

  async function getMentionScoringAttempt(
    answerId: string,
    promptVersion: string,
  ) {
    const [attempt] = await database
      .select()
      .from(schema.aiMentionScoringAttempts)
      .where(
        and(
          eq(schema.aiMentionScoringAttempts.answerId, answerId),
          eq(schema.aiMentionScoringAttempts.promptVersion, promptVersion),
        ),
      )
      .limit(1);
    return attempt ?? null;
  }

  async function completeMentionScoring(values: {
    attemptId: string;
    answerId: string;
    status: "success" | "failed" | "skipped";
    completedAt: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    costBasis: "actual" | "estimated" | "unknown";
    errorCode: string | null;
    sentiments?: Array<{
      mentionId: number;
      sentiment: "positive" | "neutral" | "negative" | null;
    }>;
  }) {
    const scoringStatus =
      values.status === "success"
        ? ("scored" as const)
        : values.status === "failed"
          ? ("failed" as const)
          : ("skipped" as const);
    await executeAtomically((tx) => [
      ...(values.sentiments ?? []).map((sentiment) =>
        tx
          .update(schema.aiBrandMentions)
          .set({
            sentiment: sentiment.sentiment,
            scoringStatus,
            scoringAttemptId: values.attemptId,
            scoredAt: values.completedAt,
          })
          .where(
            and(
              eq(schema.aiBrandMentions.id, sentiment.mentionId),
              eq(schema.aiBrandMentions.answerId, values.answerId),
              eq(schema.aiBrandMentions.scoringStatus, "pending"),
            ),
          ),
      ),
      ...(values.status === "success"
        ? []
        : [
            tx
              .update(schema.aiBrandMentions)
              .set({
                sentiment: null,
                scoringStatus,
                scoringAttemptId: values.attemptId,
                scoredAt: values.completedAt,
              })
              .where(
                and(
                  eq(schema.aiBrandMentions.answerId, values.answerId),
                  eq(schema.aiBrandMentions.scoringStatus, "pending"),
                ),
              ),
          ]),
      tx
        .update(schema.aiMentionScoringAttempts)
        .set({
          status: values.status,
          inputTokens: values.inputTokens,
          outputTokens: values.outputTokens,
          costUsd: values.costUsd,
          costBasis: values.costBasis,
          errorCode: values.errorCode,
          completedAt: values.completedAt,
        })
        .where(
          and(
            eq(schema.aiMentionScoringAttempts.id, values.attemptId),
            eq(schema.aiMentionScoringAttempts.answerId, values.answerId),
            eq(schema.aiMentionScoringAttempts.status, "running"),
          ),
        ),
    ]);
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
    const scoringAttempts = [];
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
      scoringAttempts.push(
        ...(await database
          .select()
          .from(schema.aiMentionScoringAttempts)
          .where(inArray(schema.aiMentionScoringAttempts.answerId, ids))
          .orderBy(schema.aiMentionScoringAttempts.startedAt)),
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
    return { run, answers, mentions, scoringAttempts, citations };
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
    getOrCreateProjectRunSettings,
    updateProjectRunSettings,
    reserveProjectAnswerCalls,
    createPromptSet,
    updatePromptSet,
    addPromptSetModels,
    replacePromptSetModels,
    createTopic,
    updateTopic,
    createTrackedPrompt,
    createPromptSuggestion,
    updateTrackedPrompt,
    createTag,
    updateTag,
    assignTag,
    unassignTag,
    createBrand,
    createBrandAlias,
    getPromptSetsForProject,
    getPromptSetDefinition,
    getRunnablePromptSetDefinition,
    getDuePromptSetsWithOrganization,
    getBrandRegistry,
    getRunsForProject,
    tryCreateRun,
    updateRun,
    getRunById,
    getActiveRunForPromptSet,
    createAnswer,
    createAnswerPlaceholders,
    claimPendingAnswer,
    completeRunningAnswer,
    getAnswerById,
    getAnswersForRun,
    insertBrandMentions,
    getBrandMentionsForAnswer,
    tryCreateMentionScoringAttempt,
    getMentionScoringAttempt,
    completeMentionScoring,
    insertCitations,
    getRunWithObservations,
    pruneTerminalRunsBefore,
    pruneExpiredTerminalRuns,
  };
}
