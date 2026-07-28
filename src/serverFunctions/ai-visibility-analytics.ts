import { createServerFn } from "@tanstack/react-start";
import { getVisibilityOverview as readVisibilityOverview } from "@/server/features/ai-visibility/services/visibilityAnalytics";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { visibilityOverviewInputSchema } from "@/types/schemas/ai-visibility-analytics";

export const getVisibilityOverview = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(visibilityOverviewInputSchema)
  .handler(({ data, context }) =>
    readVisibilityOverview({
      projectId: context.projectId,
      windowDays: data.windowDays,
      leaderboardSort: data.leaderboardSort,
    }),
  );
