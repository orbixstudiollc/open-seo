import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import { AiVisibilityService } from "@/server/features/ai-visibility/services/AiVisibilityService";
import { BrandResolutionService } from "@/server/features/brand-resolution/BrandResolutionService";
import { GscService } from "@/server/features/gsc/services/GscService";
import type { CompleteAiVisibilitySetupInput } from "@/types/schemas/ai-visibility-setup";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeText(value).toLocaleLowerCase();
}

async function getState(projectId: string) {
  const [registry, promptSets, settings, gscConnection] = await Promise.all([
    AiVisibilityRepository.getBrandRegistry(projectId),
    AiVisibilityRepository.getPromptSetsForProject(projectId),
    AiVisibilityService.getProjectRunSettings(projectId),
    GscService.getConnection(projectId),
  ]);
  const promptSetDefinitions = (
    await Promise.all(
      promptSets
        .filter((promptSet) => !promptSet.archivedAt)
        .map((promptSet) =>
          AiVisibilityRepository.getPromptSetDefinition(promptSet.id),
        ),
    )
  ).filter((definition) => definition !== null);
  const activeBrands = registry.brands.filter((brand) => !brand.archivedAt);
  const primaryBrand = activeBrands.find((brand) => brand.isPrimary) ?? null;

  return {
    needsSetup: primaryBrand === null || promptSetDefinitions.length === 0,
    primaryBrand,
    competitors: activeBrands.filter((brand) => !brand.isPrimary),
    promptSets: promptSetDefinitions,
    settings,
    searchConsole: {
      connected: gscConnection !== null,
      siteUrl: gscConnection?.siteUrl ?? null,
    },
  };
}

async function completeSetup(
  input: CompleteAiVisibilitySetupInput,
  actorId: string,
) {
  await BrandResolutionService.configureRegistry(
    {
      projectId: input.projectId,
      primary: input.primary,
      competitors: input.competitors,
    },
    actorId,
  );
  await AiVisibilityService.updateProjectRunSettings({
    projectId: input.projectId,
    cadence: "weekly",
    answerCallCap: input.answerCallCap,
  });

  const existingSets = await AiVisibilityService.getPromptSets(input.projectId);
  const normalizedSetName = normalizeKey(input.promptSet.name);
  const existingSet = existingSets.find(
    (promptSet) =>
      !promptSet.archivedAt && promptSet.normalizedName === normalizedSetName,
  );
  let definition = existingSet
    ? await AiVisibilityService.getPromptSet(existingSet.id, input.projectId)
    : await AiVisibilityService.createPromptSet({
        projectId: input.projectId,
        name: input.promptSet.name,
        models: input.promptSet.models,
      });
  if (!definition) throw new Error("Failed to resolve first-run prompt set");

  if (existingSet) {
    const updated = await AiVisibilityService.updatePromptSet({
      projectId: input.projectId,
      promptSetId: existingSet.id,
      models: input.promptSet.models,
      isActive: true,
    });
    if (updated) definition = updated;
  }

  for (const topicInput of input.promptSet.topics) {
    const normalizedTopicName = normalizeKey(topicInput.name);
    let topic = definition.topics.find(
      (candidate) =>
        !candidate.archivedAt &&
        candidate.normalizedName === normalizedTopicName,
    );
    if (!topic) {
      topic = await AiVisibilityService.createTopic({
        projectId: input.projectId,
        promptSetId: definition.promptSet.id,
        name: topicInput.name,
      });
      definition.topics.push(topic);
    }

    for (const promptText of topicInput.prompts) {
      const normalizedPrompt = normalizeText(promptText);
      if (
        definition.prompts.some(
          (prompt) => prompt.normalizedPrompt === normalizedPrompt,
        )
      ) {
        continue;
      }
      const prompt = await AiVisibilityService.createTrackedPrompt({
        projectId: input.projectId,
        promptSetId: definition.promptSet.id,
        topicId: topic.id,
        prompt: promptText,
        sortOrder: definition.prompts.length,
      });
      definition.prompts.push(prompt);
    }
  }

  return {
    promptSetId: definition.promptSet.id,
    state: await getState(input.projectId),
  };
}

export const AiVisibilitySetupService = {
  getState,
  completeSetup,
};
