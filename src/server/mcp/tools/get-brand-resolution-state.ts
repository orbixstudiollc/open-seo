import { z } from "zod";
import { BrandResolutionService } from "@/server/features/brand-resolution/BrandResolutionService";
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
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getBrandResolutionStateTool = {
  name: "get_brand_resolution_state",
  config: {
    title: "Get brand resolution state",
    description:
      "Read a project's canonical, suppressed, ambiguous, and unresolved brand candidates with raw variants, evidence, confidence, rule version, history, and merge suggestions. Uses no credits.",
    inputSchema,
    outputSchema: z
      .object({
        summary: looseObjectOutputSchema,
        candidates: z.array(looseObjectOutputSchema),
        canonicalBrands: z.array(looseObjectOutputSchema),
        suggestions: z.array(looseObjectOutputSchema),
        brands: z.array(looseObjectOutputSchema),
        history: z.array(looseObjectOutputSchema),
        ruleVersion: z.string(),
        truncated: z.boolean(),
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
    const state = await BrandResolutionService.getResolutionState(
      args.projectId,
    );
    const candidates = state.candidates.slice(0, 200);
    const history = state.history.slice(0, 100);
    const truncated =
      state.truncated ||
      candidates.length < state.candidates.length ||
      history.length < state.history.length;

    return mcpResponse({
      text: `Brand resolution: ${state.summary.resolved} resolved, ${state.summary.suppressed} suppressed, ${state.summary.needsReview} need review, and ${state.summary.unresolved} unresolved.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/brand-resolution`,
      ),
      structuredContent: {
        ...state,
        candidates,
        history,
        truncated,
      },
    });
  }),
};
