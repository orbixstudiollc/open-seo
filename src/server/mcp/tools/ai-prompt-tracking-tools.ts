import { z } from "zod";
import { AiVisibilityService } from "@/server/features/ai-visibility/services/AiVisibilityService";
import { AiPromptSuggestionService } from "@/server/features/ai-visibility/services/AiPromptSuggestionService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  aiProjectRunSettingsInputSchema,
  archiveAiPromptSetInputSchema,
  assignAiPromptTagInputSchema,
  createAiPromptSetInputSchema,
  createAiPromptTagInputSchema,
  createAiPromptTopicInputSchema,
  createAiTrackedPromptInputSchema,
  PROMPT_EXPLORER_MODELS,
  promptExplorerModelSchema,
  runAiPromptSetInputSchema,
  updateAiPromptSetInputSchema,
  updateAiPromptTagInputSchema,
  updateAiPromptTopicInputSchema,
  updateAiTrackedPromptInputSchema,
} from "@/types/schemas/ai-search";
import {
  decideAiPromptSuggestionInputSchema,
  refreshAiPromptSuggestionsInputSchema,
} from "@/types/schemas/ai-visibility-setup";
import {
  aiRunCadenceSchema,
  AI_TRACKED_RUN_MAX_CALL_CAP,
} from "@/shared/ai-visibility";

const managementActionSchema = z.enum([
  "update_settings",
  "create_set",
  "update_set",
  "archive_set",
  "create_topic",
  "update_topic",
  "create_prompt",
  "update_prompt",
  "create_tag",
  "update_tag",
  "assign_tag",
  "suggest",
  "approve",
  "reject",
]);

const managementInputSchema = {
  projectId: projectIdSchema,
  action: managementActionSchema,
  promptSetId: z.string().min(1).optional(),
  topicId: z.string().min(1).nullable().optional(),
  trackedPromptId: z.string().min(1).optional(),
  tagId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(500).optional(),
  models: z
    .array(promptExplorerModelSchema)
    .min(1)
    .max(PROMPT_EXPLORER_MODELS.length)
    .optional(),
  cadence: aiRunCadenceSchema.optional(),
  answerCallCap: z
    .number()
    .int()
    .min(1)
    .max(AI_TRACKED_RUN_MAX_CALL_CAP)
    .optional(),
  isActive: z.boolean().optional(),
  archived: z.boolean().optional(),
  assigned: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
} as const;

type ManagementArgs = z.infer<z.ZodObject<typeof managementInputSchema>>;

async function manage(args: ManagementArgs) {
  switch (args.action) {
    case "update_settings":
      return AiVisibilityService.updateProjectRunSettings(
        aiProjectRunSettingsInputSchema.parse(args),
      );
    case "create_set":
      return AiVisibilityService.createPromptSet(
        createAiPromptSetInputSchema.parse(args),
      );
    case "update_set":
      return AiVisibilityService.updatePromptSet(
        updateAiPromptSetInputSchema.parse(args),
      );
    case "archive_set":
      await AiVisibilityService.archivePromptSet(
        archiveAiPromptSetInputSchema.parse(args),
      );
      return { archived: true };
    case "create_topic":
      return AiVisibilityService.createTopic(
        createAiPromptTopicInputSchema.parse(args),
      );
    case "update_topic":
      return AiVisibilityService.updateTopic(
        updateAiPromptTopicInputSchema.parse(args),
      );
    case "create_prompt":
      return AiVisibilityService.createTrackedPrompt(
        createAiTrackedPromptInputSchema.parse(args),
      );
    case "update_prompt":
      return AiVisibilityService.updateTrackedPrompt(
        updateAiTrackedPromptInputSchema.parse(args),
      );
    case "create_tag":
      return AiVisibilityService.createTag(
        createAiPromptTagInputSchema.parse(args),
      );
    case "update_tag":
      return AiVisibilityService.updateTag(
        updateAiPromptTagInputSchema.parse(args),
      );
    case "assign_tag":
      await AiVisibilityService.assignTag(
        assignAiPromptTagInputSchema.parse(args),
      );
      return { assigned: args.assigned ?? true };
    case "suggest":
      return AiPromptSuggestionService.refreshSuggestions(
        refreshAiPromptSuggestionsInputSchema.parse(args),
      );
    case "approve":
    case "reject":
      return AiPromptSuggestionService.decideSuggestion(
        decideAiPromptSuggestionInputSchema.parse({
          ...args,
          decision: args.action,
        }),
      );
  }
}

export const manageAiPromptTrackingTool = {
  name: "manage_ai_prompt_tracking",
  config: {
    title: "Manage AI prompt tracking",
    description:
      "Configure tracked runs and manage prompt suggestions without paid provider calls. Actions: update_settings, create_set, update_set, archive_set, create_topic, update_topic, create_prompt, update_prompt, create_tag, update_tag, assign_tag, suggest, approve, reject. Suggest reads Search Console when connected and adds topic-gap candidates; approve activates a candidate and reject prevents it from resurfacing.",
    inputSchema: managementInputSchema,
    outputSchema: {
      result: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: ManagementArgs, context) => {
    const result = await manage(args);
    return mcpResponse({
      text: `AI prompt tracking action ${args.action} completed.`,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: {
        result: result ?? { ok: true },
      },
    });
  }),
};

const runInputSchema = {
  projectId: projectIdSchema,
  promptSetId: z.string().min(1),
} as const;

type RunArgs = z.infer<z.ZodObject<typeof runInputSchema>>;

export const runAiPromptSetTool = {
  name: "run_ai_prompt_set",
  config: {
    title: "Run AI prompt set",
    description:
      "Start a tracked prompt-set run now. This performs paid DataForSEO LLM calls and consumes the same atomic project call budget as scheduled runs.",
    inputSchema: runInputSchema,
    outputSchema: {
      result: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: RunArgs, context) => {
    const input = runAiPromptSetInputSchema.parse(args);
    const result = await AiVisibilityService.runPromptSet({
      ...input,
      billingCustomer: context.billing,
    });
    return mcpResponse({
      text: result.ok
        ? `Started AI tracked run ${result.runId}.`
        : `AI tracked run was not started: ${result.reason}.`,
      meta: {
        ...buildProjectMeta(context, args.projectId),
        runId: result.ok ? result.runId : undefined,
      },
      structuredContent: { result },
    });
  }),
};
