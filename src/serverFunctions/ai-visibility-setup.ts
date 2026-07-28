import { createServerFn } from "@tanstack/react-start";
import { AiPromptSuggestionService } from "@/server/features/ai-visibility/services/AiPromptSuggestionService";
import { AiVisibilitySetupService } from "@/server/features/ai-visibility/services/AiVisibilitySetupService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  aiVisibilitySetupStateInputSchema,
  completeAiVisibilitySetupInputSchema,
  decideAiPromptSuggestionInputSchema,
  refreshAiPromptSuggestionsInputSchema,
} from "@/types/schemas/ai-visibility-setup";

export const getAiVisibilitySetupState = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(aiVisibilitySetupStateInputSchema)
  .handler(({ context }) =>
    AiVisibilitySetupService.getState(context.projectId),
  );

export const completeAiVisibilitySetup = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(completeAiVisibilitySetupInputSchema)
  .handler(({ data, context }) =>
    AiVisibilitySetupService.completeSetup(
      { ...data, projectId: context.projectId },
      context.userId,
    ),
  );

export const refreshAiPromptSuggestions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(refreshAiPromptSuggestionsInputSchema)
  .handler(({ data, context }) =>
    AiPromptSuggestionService.refreshSuggestions({
      ...data,
      projectId: context.projectId,
    }),
  );

export const decideAiPromptSuggestion = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(decideAiPromptSuggestionInputSchema)
  .handler(({ data, context }) =>
    AiPromptSuggestionService.decideSuggestion({
      ...data,
      projectId: context.projectId,
    }),
  );
