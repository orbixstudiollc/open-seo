import { env } from "cloudflare:workers";
import type { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import { beginAiTrackedRun } from "@/server/features/ai-visibility/services/aiTrackedRunGuards";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { computeNextAiRunAt } from "@/shared/ai-visibility";
import {
  type AiProjectRunSettingsInput,
  type archiveAiPromptSetInputSchema,
  type assignAiPromptTagInputSchema,
  type createAiPromptSetInputSchema,
  type createAiPromptTagInputSchema,
  type createAiPromptTopicInputSchema,
  type createAiTrackedPromptInputSchema,
  type updateAiPromptSetInputSchema,
  type updateAiPromptTagInputSchema,
  type updateAiPromptTopicInputSchema,
  type updateAiTrackedPromptInputSchema,
} from "@/types/schemas/ai-search";

type CreatePromptSetInput = z.infer<typeof createAiPromptSetInputSchema>;
type UpdatePromptSetInput = z.infer<typeof updateAiPromptSetInputSchema>;
type ArchivePromptSetInput = z.infer<typeof archiveAiPromptSetInputSchema>;
type CreateTopicInput = z.infer<typeof createAiPromptTopicInputSchema>;
type UpdateTopicInput = z.infer<typeof updateAiPromptTopicInputSchema>;
type CreatePromptInput = z.infer<typeof createAiTrackedPromptInputSchema>;
type UpdatePromptInput = z.infer<typeof updateAiTrackedPromptInputSchema>;
type CreateTagInput = z.infer<typeof createAiPromptTagInputSchema>;
type UpdateTagInput = z.infer<typeof updateAiPromptTagInputSchema>;
type AssignTagInput = z.infer<typeof assignAiPromptTagInputSchema>;

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeNameKey(value: string) {
  return normalizeName(value).toLocaleLowerCase();
}

function normalizePrompt(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function requirePromptSet(promptSetId: string, projectId: string) {
  const definition =
    await AiVisibilityRepository.getPromptSetDefinition(promptSetId);
  if (!definition || definition.promptSet.projectId !== projectId) {
    throw new AppError("NOT_FOUND", "Tracked prompt set not found");
  }
  return definition;
}

async function requireTopic(
  promptSetId: string,
  projectId: string,
  topicId: string | null | undefined,
) {
  if (!topicId) return;
  const definition = await requirePromptSet(promptSetId, projectId);
  if (!definition.topics.some((topic) => topic.id === topicId)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Topic does not belong to prompt set",
    );
  }
}

async function assertPaidPlan(organizationId: string) {
  if (!(await isHostedServerAuthMode())) return;
  if (await customerHasPaidPlan(organizationId)) return;
  throw new AppError(
    "PAYMENT_REQUIRED",
    "Upgrade to the paid plan to run tracked prompts",
  );
}

async function getProjectRunSettings(projectId: string) {
  return AiVisibilityRepository.getOrCreateProjectRunSettings(projectId);
}

async function getPromptSets(projectId: string) {
  return AiVisibilityRepository.getPromptSetsForProject(projectId);
}

async function getPromptSet(promptSetId: string, projectId: string) {
  return requirePromptSet(promptSetId, projectId);
}

async function updateProjectRunSettings(input: AiProjectRunSettingsInput) {
  const now = new Date();
  const nowIso = now.toISOString();
  const settings = await AiVisibilityRepository.updateProjectRunSettings(
    input.projectId,
    {
      cadence: input.cadence,
      answerCallCap: input.answerCallCap,
      updatedAt: nowIso,
    },
  );

  const promptSets = await AiVisibilityRepository.getPromptSetsForProject(
    input.projectId,
  );
  for (const promptSet of promptSets) {
    if (promptSet.archivedAt) continue;
    await AiVisibilityRepository.updatePromptSet(
      promptSet.id,
      input.projectId,
      {
        // Kept in sync for Phase 0 compatibility; scheduling reads settings.
        cadence: input.cadence,
        nextRunAt: promptSet.isActive
          ? computeNextAiRunAt(input.cadence, null, now)
          : null,
        updatedAt: nowIso,
      },
    );
  }
  return settings;
}

async function createPromptSet(input: CreatePromptSetInput) {
  const settings = await AiVisibilityRepository.getOrCreateProjectRunSettings(
    input.projectId,
  );
  const now = new Date();
  const name = normalizeName(input.name);
  const promptSet = await AiVisibilityRepository.createPromptSet({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    name,
    normalizedName: normalizeNameKey(name),
    cadence: settings.cadence,
    nextRunAt: computeNextAiRunAt(settings.cadence, null, now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await AiVisibilityRepository.addPromptSetModels(promptSet.id, input.models);
  return AiVisibilityRepository.getPromptSetDefinition(promptSet.id);
}

async function updatePromptSet(input: UpdatePromptSetInput) {
  const definition = await requirePromptSet(input.promptSetId, input.projectId);
  const now = new Date();
  const values: Parameters<typeof AiVisibilityRepository.updatePromptSet>[2] = {
    updatedAt: now.toISOString(),
  };
  if (input.name !== undefined) {
    values.name = normalizeName(input.name);
    values.normalizedName = normalizeNameKey(input.name);
  }
  if (input.isActive !== undefined) {
    values.isActive = input.isActive;
    const settings = await AiVisibilityRepository.getOrCreateProjectRunSettings(
      input.projectId,
    );
    values.nextRunAt = input.isActive
      ? computeNextAiRunAt(settings.cadence, null, now)
      : null;
  }
  await AiVisibilityRepository.updatePromptSet(
    input.promptSetId,
    input.projectId,
    values,
  );
  if (input.models) {
    await AiVisibilityRepository.replacePromptSetModels(
      definition.promptSet.id,
      input.models,
    );
  }
  return AiVisibilityRepository.getPromptSetDefinition(input.promptSetId);
}

async function archivePromptSet(input: ArchivePromptSetInput) {
  await requirePromptSet(input.promptSetId, input.projectId);
  const nowIso = new Date().toISOString();
  await AiVisibilityRepository.updatePromptSet(
    input.promptSetId,
    input.projectId,
    {
      isActive: false,
      nextRunAt: null,
      archivedAt: nowIso,
      updatedAt: nowIso,
    },
  );
}

async function createTopic(input: CreateTopicInput) {
  await requirePromptSet(input.promptSetId, input.projectId);
  const name = normalizeName(input.name);
  return AiVisibilityRepository.createTopic({
    id: crypto.randomUUID(),
    promptSetId: input.promptSetId,
    name,
    normalizedName: normalizeNameKey(name),
  });
}

async function updateTopic(input: UpdateTopicInput) {
  const definition = await requirePromptSet(input.promptSetId, input.projectId);
  if (!definition.topics.some((topic) => topic.id === input.topicId)) {
    throw new AppError("NOT_FOUND", "Tracked prompt topic not found");
  }
  const values: Parameters<typeof AiVisibilityRepository.updateTopic>[2] = {
    updatedAt: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    values.name = normalizeName(input.name);
    values.normalizedName = normalizeNameKey(input.name);
  }
  if (input.archived !== undefined) {
    values.archivedAt = input.archived ? new Date().toISOString() : null;
  }
  return AiVisibilityRepository.updateTopic(
    input.topicId,
    input.promptSetId,
    values,
  );
}

async function createTrackedPrompt(input: CreatePromptInput) {
  await requirePromptSet(input.promptSetId, input.projectId);
  await requireTopic(input.promptSetId, input.projectId, input.topicId);
  const prompt = normalizePrompt(input.prompt);
  return AiVisibilityRepository.createTrackedPrompt({
    id: crypto.randomUUID(),
    promptSetId: input.promptSetId,
    topicId: input.topicId ?? null,
    prompt,
    normalizedPrompt: prompt,
    sortOrder: input.sortOrder,
  });
}

async function updateTrackedPrompt(input: UpdatePromptInput) {
  const definition = await requirePromptSet(input.promptSetId, input.projectId);
  if (
    !definition.prompts.some((prompt) => prompt.id === input.trackedPromptId)
  ) {
    throw new AppError("NOT_FOUND", "Tracked prompt not found");
  }
  if (input.topicId !== undefined) {
    await requireTopic(input.promptSetId, input.projectId, input.topicId);
  }
  const values: Parameters<
    typeof AiVisibilityRepository.updateTrackedPrompt
  >[2] = { updatedAt: new Date().toISOString() };
  if (input.prompt !== undefined) {
    values.prompt = normalizePrompt(input.prompt);
    values.normalizedPrompt = normalizePrompt(input.prompt);
  }
  if (input.topicId !== undefined) values.topicId = input.topicId;
  if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder;
  if (input.archived !== undefined) {
    values.archivedAt = input.archived ? new Date().toISOString() : null;
  }
  return AiVisibilityRepository.updateTrackedPrompt(
    input.trackedPromptId,
    input.promptSetId,
    values,
  );
}

async function createTag(input: CreateTagInput) {
  await requirePromptSet(input.promptSetId, input.projectId);
  const name = normalizeName(input.name);
  return AiVisibilityRepository.createTag({
    id: crypto.randomUUID(),
    promptSetId: input.promptSetId,
    name,
    normalizedName: normalizeNameKey(name),
  });
}

async function updateTag(input: UpdateTagInput) {
  const definition = await requirePromptSet(input.promptSetId, input.projectId);
  if (!definition.tags.some((tag) => tag.id === input.tagId)) {
    throw new AppError("NOT_FOUND", "Tracked prompt tag not found");
  }
  const values: Parameters<typeof AiVisibilityRepository.updateTag>[2] = {
    updatedAt: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    values.name = normalizeName(input.name);
    values.normalizedName = normalizeNameKey(input.name);
  }
  if (input.archived !== undefined) {
    values.archivedAt = input.archived ? new Date().toISOString() : null;
  }
  return AiVisibilityRepository.updateTag(
    input.tagId,
    input.promptSetId,
    values,
  );
}

async function assignTag(input: AssignTagInput) {
  const definition = await requirePromptSet(input.promptSetId, input.projectId);
  const hasPrompt = definition.prompts.some(
    (prompt) => prompt.id === input.trackedPromptId,
  );
  const hasTag = definition.tags.some((tag) => tag.id === input.tagId);
  if (!hasPrompt || !hasTag) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Prompt and tag must belong to the same prompt set",
    );
  }
  if (input.assigned) {
    await AiVisibilityRepository.assignTag(input.trackedPromptId, input.tagId);
  } else {
    await AiVisibilityRepository.unassignTag(
      input.trackedPromptId,
      input.tagId,
    );
  }
}

async function runPromptSet(input: {
  promptSetId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
}) {
  await assertPaidPlan(input.billingCustomer.organizationId);
  return beginAiTrackedRun({
    workflow: env.AI_TRACKED_RUN_WORKFLOW,
    promptSetId: input.promptSetId,
    projectId: input.projectId,
    billingCustomer: input.billingCustomer,
    trigger: "manual",
  });
}

export const AiVisibilityService = {
  getProjectRunSettings,
  getPromptSets,
  getPromptSet,
  updateProjectRunSettings,
  createPromptSet,
  updatePromptSet,
  archivePromptSet,
  createTopic,
  updateTopic,
  createTrackedPrompt,
  updateTrackedPrompt,
  createTag,
  updateTag,
  assignTag,
  runPromptSet,
};
