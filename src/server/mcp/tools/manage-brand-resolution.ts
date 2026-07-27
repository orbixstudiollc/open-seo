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
import { brandResolutionActionSchema } from "@/types/schemas/brand-resolution";

const inputSchema = {
  projectId: projectIdSchema,
  action: z
    .enum(["refresh", "merge", "split", "restore", "suppress", "needs_review"])
    .describe("Resolution action to apply."),
  normalizedNames: z
    .array(z.string().min(1).max(160))
    .min(1)
    .max(20)
    .optional()
    .describe("Candidate normalized names affected by a manual action."),
  canonicalName: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe("Canonical display name for merge, split, or restore."),
  brandId: z
    .string()
    .min(1)
    .optional()
    .describe("Existing canonical brand ID, when known."),
  domain: z
    .string()
    .min(1)
    .max(253)
    .optional()
    .describe("Optional primary domain for a newly created canonical brand."),
  reason: z
    .string()
    .min(3)
    .max(500)
    .optional()
    .describe("Required review reason for every manual action."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const manageBrandResolutionTool = {
  name: "manage_brand_resolution",
  config: {
    title: "Manage brand resolution",
    description:
      "Refresh automatic rules or apply a reversible manual merge, split, restore, suppression, or review decision. Raw mentions are never changed. Uses no credits. Confirm manual actions with the user before applying them.",
    inputSchema,
    outputSchema: z
      .object({
        action: z.string(),
        updated: z.number().optional(),
        summary: looseObjectOutputSchema,
        candidates: z.array(looseObjectOutputSchema),
        ruleVersion: z.string(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    if (args.action === "refresh") {
      const result = await BrandResolutionService.refreshAutomaticResolutions(
        args.projectId,
      );
      return mcpResponse({
        text: `Refreshed brand resolution and updated ${result.updated} candidate rule(s).`,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/brand-resolution`,
        ),
        structuredContent: {
          action: args.action,
          updated: result.updated,
          summary: result.state.summary,
          candidates: result.state.candidates.slice(0, 200),
          ruleVersion: result.state.ruleVersion,
        },
      });
    }

    const action = brandResolutionActionSchema.parse({
      projectId: args.projectId,
      action: args.action,
      normalizedNames: args.normalizedNames,
      canonicalName: args.canonicalName,
      brandId: args.brandId,
      domain: args.domain,
      reason: args.reason,
    });
    const state = await BrandResolutionService.applyManualAction(
      action,
      context.auth.userId,
    );
    return mcpResponse({
      text: `Applied reversible ${args.action} decision to ${action.normalizedNames.length} candidate(s).`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/brand-resolution`,
      ),
      structuredContent: {
        action: args.action,
        summary: state.summary,
        candidates: state.candidates.slice(0, 200),
        ruleVersion: state.ruleVersion,
      },
    });
  }),
};
