import { createServerFn } from "@tanstack/react-start";
import { getAnswerExplorer as readAnswerExplorer } from "@/server/features/ai-visibility/services/answerExplorer";
import { getBrandVisibilityDetail as readBrandVisibilityDetail } from "@/server/features/ai-visibility/services/brandVisibilityDetail";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  answerExplorerInputSchema,
  brandVisibilityDetailInputSchema,
} from "@/types/schemas/ai-answer-explorer";

export const getAnswerExplorer = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(answerExplorerInputSchema)
  .handler(({ data, context }) =>
    readAnswerExplorer({
      projectId: context.projectId,
      answerId: data.answerId,
      trackedPromptId: data.trackedPromptId,
      model: data.model,
      page: data.page,
    }),
  );

export const getBrandVisibilityDetail = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(brandVisibilityDetailInputSchema)
  .handler(({ data, context }) =>
    readBrandVisibilityDetail({
      projectId: context.projectId,
      brandId: data.brandId,
      windowDays: data.windowDays,
    }),
  );
