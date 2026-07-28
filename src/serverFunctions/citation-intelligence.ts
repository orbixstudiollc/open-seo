import { createServerFn } from "@tanstack/react-start";
import { getCitationIntelligenceOverview as readCitationIntelligenceOverview } from "@/server/features/ai-visibility/services/citationIntelligence";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { citationIntelligenceInputSchema } from "@/types/schemas/citation-intelligence";

export const getCitationIntelligenceOverview = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(citationIntelligenceInputSchema)
  .handler(({ data, context }) =>
    readCitationIntelligenceOverview({
      projectId: context.projectId,
      windowDays: data.windowDays,
    }),
  );
