import { db } from "@/db";
import {
  aiAnswers,
  aiBrandAliases,
  aiBrandMentions,
  aiBrands,
  aiCitations,
  aiProjectRunSettings,
  aiPromptSetModels,
  aiPromptSets,
  aiPromptTagAssignments,
  aiPromptTags,
  aiPromptTopics,
  aiRuns,
  aiTrackedPrompts,
  projects,
} from "@/db/schema";
import { createAiVisibilityRepository } from "./createAiVisibilityRepository";

export const AiVisibilityRepository = createAiVisibilityRepository(db, {
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
  aiCitations,
});
