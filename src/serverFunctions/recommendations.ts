import { createServerFn } from "@tanstack/react-start";
import {
  generateRecommendationQueue as generateQueue,
  getRecommendationQueue as readQueue,
  setRecommendationStatus as updateStatus,
} from "@/server/features/recommendations/RecommendationService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  recommendationProjectInputSchema,
  updateRecommendationStatusInputSchema,
} from "@/types/schemas/recommendations";

export const getRecommendationQueue = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(recommendationProjectInputSchema)
  .handler(({ context }) => readQueue(context.projectId));

export const generateRecommendationQueue = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(recommendationProjectInputSchema)
  .handler(({ context }) => generateQueue({ projectId: context.projectId }));

export const setRecommendationStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateRecommendationStatusInputSchema)
  .handler(({ data, context }) =>
    updateStatus({
      projectId: context.projectId,
      recommendationId: data.recommendationId,
      status: data.status,
    }),
  );
