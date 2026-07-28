import { z } from "zod";
import { getVisibilityOverview } from "@/server/features/ai-visibility/services/visibilityAnalytics";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  visibilityLeaderboardSortSchema,
  visibilityWindowSchema,
} from "@/types/schemas/ai-visibility-analytics";

const inputSchema = {
  projectId: projectIdSchema,
  windowDays: visibilityWindowSchema
    .default(30)
    .describe("Current and prior comparison window in days: 7, 30, or 90."),
  leaderboardSort: visibilityLeaderboardSortSchema
    .default("mentions")
    .describe(
      "Order the brand leaderboard by mention volume, estimated sentiment, or average first-mention position.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getAiVisibilityAnalyticsTool = {
  name: "get_ai_visibility_analytics",
  config: {
    title: "Get AI visibility analytics",
    description:
      "Read coverage-aware visibility, trend, platform, topic, prompt, and brand leaderboard analytics, including estimated sentiment and average first-mention position. Uses no credits. Missing scoring and platform failures remain null rather than zero.",
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
    const overview = await getVisibilityOverview({
      projectId: args.projectId,
      windowDays: args.windowDays,
      leaderboardSort: args.leaderboardSort,
    });
    return mcpResponse({
      text: summarizeOverview(overview),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/visibility`,
        { days: args.windowDays === 30 ? undefined : args.windowDays },
      ),
      structuredContent: { overview },
    });
  }),
};

function summarizeOverview(
  overview: Awaited<ReturnType<typeof getVisibilityOverview>>,
): string {
  if (!overview.primaryBrand) {
    return `AI visibility over the last ${overview.windowDays} days is unavailable because the project has no primary brand.`;
  }
  if (overview.metric.visibilityPct == null) {
    return `AI visibility over the last ${overview.windowDays} days has no successful stored answers yet. ${overview.comparison.message}`;
  }
  const delta =
    overview.comparison.deltaPctPoints == null
      ? overview.comparison.message
      : `${formatSigned(overview.comparison.deltaPctPoints)} percentage points versus the previous period.`;
  return `AI visibility over the last ${overview.windowDays} days: ${overview.metric.visibilityPct}% (${overview.metric.mentionedAnswers}/${overview.metric.successfulAnswers} successful answers mention ${overview.primaryBrand.name}). ${delta}`;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
