import { db } from "@/db";
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
} from "@/db/schema";
import { createAiVisibilityRepository } from "./createAiVisibilityRepository";

export const AiVisibilityRepository = createAiVisibilityRepository(db, {
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
});
