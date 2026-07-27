/* eslint-disable max-lines, max-lines-per-function, no-restricted-imports -- dual-dialect contract intentionally exercises the full repository surface. */
/* oxlint-disable typescript/no-unsafe-type-assertion -- the runtime parity contract deliberately crosses incompatible Drizzle driver types. */
// @ts-nocheck -- contract intentionally runs one canonical repository against
// incompatible Drizzle driver types; runtime schema parity is what this test verifies.
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as sqliteAiVisibility from "@/db/ai-visibility.schema";
import * as pgAiVisibility from "@/db/pg/ai-visibility.schema";
import {
  createAiVisibilityRepository,
  type AiVisibilityRepositoryDatabase,
  type AiVisibilityRepositoryTables,
} from "./createAiVisibilityRepository";

type Repository = ReturnType<typeof createAiVisibilityRepository>;
type ContractContext = {
  repository: Repository;
  projectId: string;
  dispose: () => Promise<void>;
};

function runRepositoryContract(
  label: string,
  setup: () => Promise<ContractContext>,
) {
  describe(`${label} AI visibility repository`, () => {
    let context: ContractContext;

    beforeAll(async () => {
      context = await setup();
    });

    afterAll(async () => {
      await context.dispose();
    });

    it("round-trips configuration, a synthetic run, and retention cascades", async () => {
      const { repository, projectId } = context;
      const promptSetId = `${label}-set`;
      const topicId = `${label}-topic`;
      const promptId = `${label}-prompt`;
      const tagId = `${label}-tag`;
      const brandId = `${label}-brand`;
      const runId = `${label}-run`;
      const answerId = `${label}-answer`;

      await repository.createPromptSet({
        id: promptSetId,
        projectId,
        name: "Core prompts",
        normalizedName: "core prompts",
        cadence: "weekly",
      });
      await repository.addPromptSetModels(promptSetId, [
        "future/model-2",
        "model-alpha",
        "model-alpha",
      ]);
      await repository.createTopic({
        id: topicId,
        promptSetId,
        name: "Recommendations",
        normalizedName: "recommendations",
      });
      await repository.createTrackedPrompt({
        id: promptId,
        promptSetId,
        topicId,
        prompt: "Which tools should a small team use?",
        normalizedPrompt: "Which tools should a small team use?",
      });
      await repository.createTag({
        id: tagId,
        promptSetId,
        name: "Commercial",
        normalizedName: "commercial",
      });
      await repository.assignTag(promptId, tagId);
      await repository.assignTag(promptId, tagId);

      await repository.createBrand({
        id: brandId,
        projectId,
        name: "Acme",
        normalizedName: "acme",
        domain: "acme.example",
        isPrimary: true,
      });
      await repository.createBrandAlias({
        id: `${label}-alias`,
        projectId,
        brandId,
        alias: "Acme Inc.",
        normalizedAlias: "acme inc",
      });

      await expect(
        repository.tryCreateRun({
          id: runId,
          promptSetId,
          projectId,
          trigger: "manual",
          promptsTotal: 1,
          answersExpected: 1,
          startedAt: "2024-01-01T00:00:00.000Z",
        }),
      ).resolves.toBe(true);
      await expect(
        repository.tryCreateRun({
          id: `${runId}-duplicate`,
          promptSetId,
          projectId,
        }),
      ).resolves.toBe(false);

      await repository.updateRun(runId, { status: "running" });
      const answer = await repository.createAnswer({
        id: answerId,
        runId,
        trackedPromptId: promptId,
        promptText: "Which tools should a small team use?",
        model: "model-alpha",
        modelName: "model-alpha-2026-07",
        status: "success",
        responseText: "Acme is useful. See the cited guide.",
        cacheKey: "ai-search:prompt-response:synthetic",
        sourceFetchedAt: "2024-01-01T00:00:01.000Z",
        observedAt: "2024-01-01T00:00:02.000Z",
        outputTokens: 42,
        webSearch: true,
      });
      expect(answer.id).toBe(answerId);

      const mention = {
        answerId,
        rawName: "Acme",
        normalizedName: "acme",
        brandId,
        mentionCount: 1,
      };
      await repository.insertBrandMentions([mention, mention]);
      const citation = {
        answerId,
        citationOrder: 0,
        url: "https://example.com/guide",
        domain: "example.com",
        title: "Guide",
      };
      await repository.insertCitations([citation, citation]);
      await repository.updateRun(runId, {
        status: "completed",
        promptsCompleted: 1,
        answersSucceeded: 1,
        providerCostUsd: 0.002,
        creditsConsumed: 1,
        completedAt: "2024-01-01T00:00:03.000Z",
      });

      const definition = await repository.getPromptSetDefinition(promptSetId);
      expect(definition).toMatchObject({
        promptSet: { id: promptSetId, cadence: "weekly" },
        models: [{ model: "future/model-2" }, { model: "model-alpha" }],
        topics: [{ id: topicId }],
        prompts: [{ id: promptId, topicId }],
        tags: [{ id: tagId }],
        assignments: [{ trackedPromptId: promptId, tagId }],
      });

      const registry = await repository.getBrandRegistry(projectId);
      expect(registry).toMatchObject({
        brands: [{ id: brandId, isPrimary: true }],
        aliases: [{ brandId, normalizedAlias: "acme inc" }],
      });

      const stored = await repository.getRunWithObservations(runId);
      expect(stored).toMatchObject({
        run: { id: runId, status: "completed" },
        answers: [
          {
            id: answerId,
            promptText: "Which tools should a small team use?",
            cacheKey: "ai-search:prompt-response:synthetic",
          },
        ],
        mentions: [{ normalizedName: "acme", brandId }],
        citations: [{ domain: "example.com", citationOrder: 0 }],
      });
      expect(stored?.mentions).toHaveLength(1);
      expect(stored?.citations).toHaveLength(1);

      await expect(
        repository.pruneTerminalRunsBefore({
          projectId,
          cutoff: "2025-02-04T00:00:00.000Z",
        }),
      ).resolves.toBe(1);
      await expect(
        repository.getRunWithObservations(runId),
      ).resolves.toBeNull();
      await expect(
        repository.getPromptSetDefinition(promptSetId),
      ).resolves.not.toBeNull();
      await expect(
        repository.getBrandRegistry(projectId),
      ).resolves.toMatchObject({ brands: [{ id: brandId }] });
    });

    it("atomically enforces the project answer-call budget and resets its window", async () => {
      const { repository, projectId } = context;
      await repository.updateProjectRunSettings(projectId, {
        cadence: "weekly",
        answerCallCap: 200,
      });

      const windowStartedAt = "2026-07-27T00:00:00.000Z";
      const reservations = await Promise.all([
        repository.reserveProjectAnswerCalls({
          projectId,
          calls: 120,
          windowStartedAt,
          now: "2026-07-27T01:00:00.000Z",
        }),
        repository.reserveProjectAnswerCalls({
          projectId,
          calls: 120,
          windowStartedAt,
          now: "2026-07-27T01:00:00.000Z",
        }),
      ]);
      expect(reservations.filter((result) => result.reserved)).toHaveLength(1);
      await expect(
        repository.getOrCreateProjectRunSettings(projectId),
      ).resolves.toMatchObject({
        callsReserved: 120,
        answerCallCap: 200,
        windowStartedAt,
      });

      const nextWindow = await repository.reserveProjectAnswerCalls({
        projectId,
        calls: 180,
        windowStartedAt: "2026-08-03T00:00:00.000Z",
        now: "2026-08-03T00:01:00.000Z",
      });
      expect(nextWindow).toMatchObject({
        reserved: true,
        settings: {
          callsReserved: 180,
          windowStartedAt: "2026-08-03T00:00:00.000Z",
        },
      });
      await expect(
        repository.reserveProjectAnswerCalls({
          projectId,
          calls: 21,
          windowStartedAt: "2026-08-03T00:00:00.000Z",
          now: "2026-08-03T00:02:00.000Z",
        }),
      ).resolves.toMatchObject({ reserved: false });
    });

    it("updates and archives prompt sets, prompts, topics, tags, and assignments", async () => {
      const { repository, projectId } = context;
      const promptSetId = `${label}-crud-set`;
      const topicId = `${label}-crud-topic`;
      const promptId = `${label}-crud-prompt`;
      const tagId = `${label}-crud-tag`;
      await repository.createPromptSet({
        id: promptSetId,
        projectId,
        name: "Original",
        normalizedName: "original",
      });
      await repository.addPromptSetModels(promptSetId, ["chat_gpt"]);
      await repository.createTopic({
        id: topicId,
        promptSetId,
        name: "Original topic",
        normalizedName: "original topic",
      });
      await repository.createTrackedPrompt({
        id: promptId,
        promptSetId,
        topicId,
        prompt: "Original prompt",
        normalizedPrompt: "Original prompt",
      });
      await repository.createTag({
        id: tagId,
        promptSetId,
        name: "Original tag",
        normalizedName: "original tag",
      });
      await repository.assignTag(promptId, tagId);

      await repository.updatePromptSet(promptSetId, projectId, {
        name: "Updated",
        normalizedName: "updated",
      });
      await repository.replacePromptSetModels(promptSetId, [
        "chat_gpt",
        "claude",
      ]);
      await repository.updateTopic(topicId, promptSetId, {
        name: "Updated topic",
        normalizedName: "updated topic",
      });
      await repository.updateTrackedPrompt(promptId, promptSetId, {
        prompt: "Updated prompt",
        normalizedPrompt: "Updated prompt",
        sortOrder: 2,
      });
      await repository.updateTag(tagId, promptSetId, {
        name: "Updated tag",
        normalizedName: "updated tag",
      });
      await repository.unassignTag(promptId, tagId);

      await expect(
        repository.getPromptSetDefinition(promptSetId),
      ).resolves.toMatchObject({
        promptSet: { name: "Updated" },
        models: [{ model: "chat_gpt" }, { model: "claude" }],
        topics: [{ name: "Updated topic" }],
        prompts: [{ prompt: "Updated prompt", sortOrder: 2 }],
        tags: [{ name: "Updated tag" }],
        assignments: [],
      });

      const archivedAt = "2026-07-27T12:00:00.000Z";
      await repository.updateTopic(topicId, promptSetId, { archivedAt });
      await repository.updateTrackedPrompt(promptId, promptSetId, {
        archivedAt,
      });
      await repository.updateTag(tagId, promptSetId, { archivedAt });
      await repository.updatePromptSet(promptSetId, projectId, {
        archivedAt,
        isActive: false,
        nextRunAt: null,
      });
      await expect(
        repository.getRunnablePromptSetDefinition(promptSetId),
      ).resolves.toBeNull();
    });

    it("persists a complete 45-prompt × four-model unattended run", async () => {
      const { repository, projectId } = context;
      const promptSetId = `${label}-45-set`;
      const runId = `${label}-45-run`;
      const models = ["chat_gpt", "claude", "gemini", "perplexity"];
      await repository.createPromptSet({
        id: promptSetId,
        projectId,
        name: "45 prompt gate",
        normalizedName: "45 prompt gate",
      });
      await repository.addPromptSetModels(promptSetId, models);
      const prompts = Array.from({ length: 45 }, (_, index) => ({
        id: `${label}-45-prompt-${index}`,
        prompt: `Tracked question ${index}`,
      }));
      for (const [sortOrder, prompt] of prompts.entries()) {
        await repository.createTrackedPrompt({
          id: prompt.id,
          promptSetId,
          prompt: prompt.prompt,
          normalizedPrompt: prompt.prompt,
          sortOrder,
        });
      }
      await expect(
        repository.tryCreateRun({
          id: runId,
          promptSetId,
          projectId,
          trigger: "scheduled",
          promptsTotal: 45,
          answersExpected: 180,
        }),
      ).resolves.toBe(true);

      const answers = prompts.flatMap((prompt) =>
        models.map((model) => ({
          id: `${runId}:${prompt.id}:${model}`,
          runId,
          trackedPromptId: prompt.id,
          promptText: prompt.prompt,
          model,
          status: "pending" as const,
          fromCache: false,
        })),
      );
      await repository.createAnswerPlaceholders(answers);
      for (const answer of answers) {
        await expect(
          repository.claimPendingAnswer(
            answer.id,
            runId,
            "2026-07-27T10:00:00.000Z",
          ),
        ).resolves.toBe(true);
        await expect(
          repository.completeRunningAnswer(answer.id, runId, {
            status: "success",
            responseText: `Response for ${answer.promptText}`,
            providerCostUsd: 0.001,
            creditsConsumed: 2,
            observedAt: "2026-07-27T10:00:01.000Z",
            completedAt: "2026-07-27T10:00:01.000Z",
          }),
        ).resolves.toBe(true);
      }
      await repository.updateRun(runId, {
        status: "completed",
        promptsCompleted: 45,
        answersSucceeded: 180,
        providerCostUsd: 0.18,
        creditsConsumed: 360,
        completedAt: "2026-07-27T10:00:02.000Z",
      });

      const stored = await repository.getRunWithObservations(runId);
      expect(stored?.run).toMatchObject({
        status: "completed",
        promptsCompleted: 45,
        answersExpected: 180,
        answersSucceeded: 180,
        providerCostUsd: 0.18,
      });
      expect(stored?.answers).toHaveLength(180);
      expect(stored?.answers.every((answer) => !answer.fromCache)).toBe(true);
    });
  });
}

let sqliteClient: Client;

runRepositoryContract("sqlite", async () => {
  sqliteClient = createClient({ url: ":memory:" });
  await sqliteClient.execute("PRAGMA foreign_keys = ON");
  await sqliteClient.execute(
    "CREATE TABLE projects (id text PRIMARY KEY NOT NULL)",
  );
  const migrations = globSync("drizzle/*.sql").toSorted();
  const initialMigrationIndex = migrations.findIndex((path) =>
    readFileSync(path, "utf8").includes("CREATE TABLE `ai_prompt_sets`"),
  );
  if (initialMigrationIndex < 0) {
    throw new Error("AI visibility SQLite migration missing");
  }
  for (const path of migrations.slice(initialMigrationIndex)) {
    const sql = readFileSync(path, "utf8");
    if (sql.includes("ai_")) await sqliteClient.executeMultiple(sql);
  }
  await sqliteClient.execute({
    sql: "INSERT INTO projects (id) VALUES (?)",
    args: ["sqlite-project"],
  });

  const sqliteDb = drizzleLibsql(sqliteClient, {
    schema: sqliteAiVisibility,
  });
  return {
    repository: createAiVisibilityRepository(
      sqliteDb as unknown as AiVisibilityRepositoryDatabase,
      sqliteAiVisibility as unknown as AiVisibilityRepositoryTables,
    ),
    projectId: "sqlite-project",
    dispose: () => sqliteClient.close(),
  };
});

const postgresUrl = process.env.AI_VISIBILITY_TEST_POSTGRES_URL;
let postgresClient: Sql | undefined;

describe.skipIf(!postgresUrl)("postgres integration availability", () => {
  runRepositoryContract("postgres", async () => {
    postgresClient = postgres(postgresUrl!, { max: 1 });
    const organizationId = "ai-visibility-test-organization";
    const projectId = "postgres-project";
    await postgresClient`
      insert into organization (id, name, slug, created_at)
      values (
        ${organizationId},
        'AI visibility test',
        'ai-visibility-test',
        now()
      )
    `;
    await postgresClient`
      insert into projects (id, organization_id, name)
      values (${projectId}, ${organizationId}, 'AI visibility test')
    `;

    const pgDb = drizzlePostgres(postgresClient, {
      schema: pgAiVisibility,
    });
    return {
      repository: createAiVisibilityRepository(
        pgDb as unknown as AiVisibilityRepositoryDatabase,
        pgAiVisibility as unknown as AiVisibilityRepositoryTables,
      ),
      projectId,
      dispose: async () => {
        await postgresClient?.unsafe(
          `delete from organization where id = '${organizationId}'`,
        );
        await postgresClient?.end();
      },
    };
  });
});
