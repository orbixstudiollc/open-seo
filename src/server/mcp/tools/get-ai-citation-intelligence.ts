import { z } from "zod";
import { getCitationIntelligenceOverview } from "@/server/features/ai-visibility/services/citationIntelligence";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { visibilityWindowSchema } from "@/types/schemas/ai-visibility-analytics";

const inputSchema = {
  projectId: projectIdSchema,
  windowDays: visibilityWindowSchema
    .default(30)
    .describe("Stored citation window in days: 7, 30, or 90."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getAiCitationIntelligenceTool = {
  name: "get_ai_citation_intelligence",
  config: {
    title: "Get AI citation intelligence",
    description:
      "Read longitudinal citation density, domain and URL rollups, domain-type provenance, and domains cited in competitor-mentioned answers but never primary-brand-mentioned answers in the selected stored window. Uses no credits or provider calls.",
    inputSchema,
    outputSchema: z
      .object({
        overview: looseObjectOutputSchema,
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
    const overview = await getCitationIntelligenceOverview({
      projectId: args.projectId,
      windowDays: args.windowDays,
    });
    return mcpResponse({
      text: summarizeCitationIntelligence(overview),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/citations`,
        { days: args.windowDays === 30 ? undefined : args.windowDays },
      ),
      structuredContent: { overview },
    });
  }),
};

function summarizeCitationIntelligence(
  overview: Awaited<ReturnType<typeof getCitationIntelligenceOverview>>,
): string {
  if (overview.metric.successfulAnswers === 0) {
    return `Citation intelligence over the last ${overview.windowDays} days has no successful stored answers yet.`;
  }
  const density =
    overview.metric.avgCitationsPerAnswer == null
      ? "unavailable"
      : `${overview.metric.avgCitationsPerAnswer} citations per answer`;
  const primary = overview.primaryBrand?.name ?? "the primary brand";
  return `Citation intelligence over the last ${overview.windowDays} days: ${overview.metric.citations} citations across ${overview.metric.successfulAnswers} successful answers (${density}), ${overview.metric.uniqueDomains} domains, and ${overview.gapReport.totalDomains} domains cited in competitor-mentioned answers with zero ${primary}-mentioned cited answers in this window.`;
}
