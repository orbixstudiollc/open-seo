import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import {
  buildGscPromptSuggestions,
  buildTopicGapSuggestions,
} from "@/server/features/ai-visibility/services/aiPromptSuggestions";
import { GscService } from "@/server/features/gsc/services/GscService";
import { AppError } from "@/server/lib/errors";
import type { DecideAiPromptSuggestionInput } from "@/types/schemas/ai-visibility-setup";

async function requirePromptSet(projectId: string, promptSetId: string) {
  const definition =
    await AiVisibilityRepository.getPromptSetDefinition(promptSetId);
  if (!definition || definition.promptSet.projectId !== projectId) {
    throw new AppError("NOT_FOUND", "Tracked prompt set not found");
  }
  return definition;
}

async function refreshSuggestions(input: {
  projectId: string;
  promptSetId: string;
}) {
  const definition = await requirePromptSet(input.projectId, input.promptSetId);
  const connection = await GscService.getConnection(input.projectId);
  const gscRows = connection
    ? (
        await GscService.getPerformance({
          projectId: input.projectId,
          dimensions: ["query"],
          dateRange: "last_3_months",
          rowLimit: 1_000,
          type: "web",
          dataState: "final",
        })
      ).rows
    : [];
  const candidates = [
    ...buildGscPromptSuggestions(gscRows, definition),
    ...buildTopicGapSuggestions(definition),
  ];
  const createdBySource = { gsc: 0, topic_gap: 0 };
  let sortOrder =
    definition.prompts.reduce(
      (highest, prompt) => Math.max(highest, prompt.sortOrder),
      -1,
    ) + 1;

  for (const candidate of candidates) {
    const result = await AiVisibilityRepository.createPromptSuggestion({
      id: crypto.randomUUID(),
      promptSetId: input.promptSetId,
      topicId: candidate.topicId,
      prompt: candidate.prompt,
      normalizedPrompt: candidate.prompt.trim().replace(/\s+/g, " "),
      state: "suggested",
      suggestionSource: candidate.source,
      sortOrder,
    });
    if (result.created) {
      createdBySource[candidate.source] += 1;
      sortOrder += 1;
    }
  }

  const updated = await requirePromptSet(input.projectId, input.promptSetId);
  return {
    searchConsoleConnected: connection !== null,
    searchConsoleSiteUrl: connection?.siteUrl ?? null,
    created: createdBySource.gsc + createdBySource.topic_gap,
    createdBySource,
    suggestions: updated.prompts.filter(
      (prompt) => prompt.state === "suggested" && !prompt.archivedAt,
    ),
  };
}

async function decideSuggestion(input: DecideAiPromptSuggestionInput) {
  const definition = await requirePromptSet(input.projectId, input.promptSetId);
  const prompt = definition.prompts.find(
    (candidate) => candidate.id === input.trackedPromptId,
  );
  if (!prompt) {
    throw new AppError("NOT_FOUND", "Prompt suggestion not found");
  }
  const targetState = input.decision === "approve" ? "active" : "rejected";
  if (prompt.state === targetState) return prompt;
  if (prompt.state !== "suggested") {
    throw new AppError(
      "CONFLICT",
      "This prompt suggestion has already been decided",
    );
  }
  const updated = await AiVisibilityRepository.updateTrackedPrompt(
    prompt.id,
    input.promptSetId,
    {
      state: targetState,
      updatedAt: new Date().toISOString(),
    },
  );
  if (!updated) throw new Error("Failed to update prompt suggestion");
  return updated;
}

export const AiPromptSuggestionService = {
  refreshSuggestions,
  decideSuggestion,
};
