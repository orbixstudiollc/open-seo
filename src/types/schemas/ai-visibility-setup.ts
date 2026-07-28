import { z } from "zod";
import {
  AI_TRACKED_RUN_DEFAULT_CALL_CAP,
  AI_TRACKED_RUN_MAX_CALL_CAP,
} from "@/shared/ai-visibility";
import {
  PROMPT_EXPLORER_MAX_PROMPT_LENGTH,
  PROMPT_EXPLORER_MODELS,
  promptExplorerModelSchema,
} from "@/types/schemas/ai-search";
import { domainField } from "@/types/schemas/domain";

const entityId = z.string().min(1);
const brandName = z.string().trim().min(1).max(160);
const promptSetName = z.string().trim().min(1).max(120);

const competitorSchema = z.object({
  name: brandName,
  domain: domainField.optional(),
});

const setupTopicSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompts: z
    .array(z.string().trim().min(1).max(PROMPT_EXPLORER_MAX_PROMPT_LENGTH))
    .min(1)
    .max(20),
});

export const aiVisibilitySetupStateInputSchema = z.object({
  projectId: entityId,
});

export const completeAiVisibilitySetupInputSchema = z
  .object({
    projectId: entityId,
    primary: z.object({
      name: brandName,
      domain: domainField,
    }),
    competitors: z.array(competitorSchema).max(5).default([]),
    promptSet: z.object({
      name: promptSetName,
      models: z
        .array(promptExplorerModelSchema)
        .min(1)
        .max(PROMPT_EXPLORER_MODELS.length)
        .default([...PROMPT_EXPLORER_MODELS]),
      topics: z.array(setupTopicSchema).min(1).max(8),
    }),
    answerCallCap: z
      .number()
      .int()
      .min(1)
      .max(AI_TRACKED_RUN_MAX_CALL_CAP)
      .default(AI_TRACKED_RUN_DEFAULT_CALL_CAP),
  })
  .superRefine((input, context) => {
    const promptCount = input.promptSet.topics.reduce(
      (sum, topic) => sum + topic.prompts.length,
      0,
    );
    if (promptCount > 100) {
      context.addIssue({
        code: "custom",
        path: ["promptSet", "topics"],
        message: "A first-run prompt set can contain at most 100 prompts",
      });
    }
    if (promptCount * input.promptSet.models.length > input.answerCallCap) {
      context.addIssue({
        code: "custom",
        path: ["answerCallCap"],
        message: "The estimated answer calls exceed the project call cap",
      });
    }
  });

export const refreshAiPromptSuggestionsInputSchema = z.object({
  projectId: entityId,
  promptSetId: entityId,
});

export const decideAiPromptSuggestionInputSchema = z.object({
  projectId: entityId,
  promptSetId: entityId,
  trackedPromptId: entityId,
  decision: z.enum(["approve", "reject"]),
});

export type CompleteAiVisibilitySetupInput = z.infer<
  typeof completeAiVisibilitySetupInputSchema
>;
export type DecideAiPromptSuggestionInput = z.infer<
  typeof decideAiPromptSuggestionInputSchema
>;
