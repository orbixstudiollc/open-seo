import { z } from "zod";
import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import { AppError } from "@/server/lib/errors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  promptSetId: z
    .string()
    .min(1)
    .optional()
    .describe("Prompt-set ID to inspect. Omit to list project state."),
  runId: z
    .string()
    .min(1)
    .optional()
    .describe("Run ID to inspect. Omit to list project state."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getAiVisibilityStateTool = {
  name: "get_ai_visibility_state",
  config: {
    title: "Get AI visibility state",
    description:
      "Read persisted AI-visibility prompt sets, brand registry entries, recent runs, and bounded run observations. Uses no credits. Provide either promptSetId or runId for detail, or neither for a project overview.",
    inputSchema,
    outputSchema: z
      .object({
        promptSets: z.array(looseObjectOutputSchema).optional(),
        brands: z.array(looseObjectOutputSchema).optional(),
        aliases: z.array(looseObjectOutputSchema).optional(),
        runs: z.array(looseObjectOutputSchema).optional(),
        settings: looseObjectOutputSchema.optional(),
        promptSet: looseObjectOutputSchema.optional(),
        run: looseObjectOutputSchema.optional(),
        answers: z.array(looseObjectOutputSchema).optional(),
        mentions: z.array(looseObjectOutputSchema).optional(),
        scoringAttempts: z.array(looseObjectOutputSchema).optional(),
        citations: z.array(looseObjectOutputSchema).optional(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    if (args.promptSetId && args.runId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Provide either promptSetId or runId, not both.",
      );
    }

    if (args.promptSetId) {
      const definition = await AiVisibilityRepository.getPromptSetDefinition(
        args.promptSetId,
      );
      if (!definition || definition.promptSet.projectId !== args.projectId) {
        return mcpResponse({
          text: `AI visibility prompt set ${args.promptSetId} was not found in this project.`,
          meta: buildProjectMeta(context, args.projectId),
        });
      }

      const promptSet = {
        ...definition.promptSet,
        models: definition.models,
        topics: definition.topics,
        prompts: definition.prompts.slice(0, 100),
        promptCount: definition.prompts.length,
        tags: definition.tags,
        assignments: definition.assignments,
        truncated: definition.prompts.length > 100,
      };
      return mcpResponse({
        text: `AI visibility prompt set "${definition.promptSet.name}": ${definition.prompts.length} prompts, ${definition.models.length} models.`,
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: { promptSet },
      });
    }

    if (args.runId) {
      const stored = await AiVisibilityRepository.getRunWithObservations(
        args.runId,
      );
      if (!stored || stored.run.projectId !== args.projectId) {
        return mcpResponse({
          text: `AI visibility run ${args.runId} was not found in this project.`,
          meta: buildProjectMeta(context, args.projectId),
        });
      }

      const answers = stored.answers.slice(0, 50).map((answer) => ({
        ...answer,
        responseText:
          answer.responseText && answer.responseText.length > 2000
            ? `${answer.responseText.slice(0, 2000)}…`
            : answer.responseText,
      }));
      const answerIds = new Set(answers.map((answer) => answer.id));
      const mentions = stored.mentions.filter((mention) =>
        answerIds.has(mention.answerId),
      );
      const citations = stored.citations.filter((citation) =>
        answerIds.has(citation.answerId),
      );
      const scoringAttempts = stored.scoringAttempts.filter((attempt) =>
        answerIds.has(attempt.answerId),
      );
      const run = {
        ...stored.run,
        answerCount: stored.answers.length,
        returnedAnswerCount: answers.length,
        truncated: stored.answers.length > answers.length,
      };
      return mcpResponse({
        text: `AI visibility run ${stored.run.id}: ${stored.run.status}, ${stored.answers.length} answers, ${stored.mentions.length} brand mentions, ${stored.scoringAttempts.length} scoring attempts, ${stored.citations.length} citations.`,
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: {
          run,
          answers,
          mentions,
          scoringAttempts,
          citations,
        },
      });
    }

    const [promptSets, registry, runs, settings] = await Promise.all([
      AiVisibilityRepository.getPromptSetsForProject(args.projectId),
      AiVisibilityRepository.getBrandRegistry(args.projectId),
      AiVisibilityRepository.getRunsForProject(args.projectId, 20),
      AiVisibilityRepository.getOrCreateProjectRunSettings(args.projectId),
    ]);
    const text =
      promptSets.length === 0 &&
      registry.brands.length === 0 &&
      runs.length === 0
        ? "No persisted AI visibility state exists for this project yet."
        : `AI visibility state: ${promptSets.length} prompt sets, ${registry.brands.length} brands, ${runs.length} recent runs.`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: {
        promptSets,
        brands: registry.brands.slice(0, 100),
        aliases: registry.aliases.slice(0, 100),
        runs,
        settings,
      },
    });
  }),
};
