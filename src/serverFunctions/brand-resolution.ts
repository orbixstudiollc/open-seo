import { createServerFn } from "@tanstack/react-start";
import { BrandResolutionService } from "@/server/features/brand-resolution/BrandResolutionService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  brandResolutionActionSchema,
  brandResolutionStateInputSchema,
} from "@/types/schemas/brand-resolution";

export const getBrandResolutionState = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(brandResolutionStateInputSchema)
  .handler(({ context }) =>
    BrandResolutionService.getResolutionState(context.projectId),
  );

export const refreshBrandResolutions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(brandResolutionStateInputSchema)
  .handler(({ context }) =>
    BrandResolutionService.refreshAutomaticResolutions(context.projectId),
  );

export const applyBrandResolutionAction = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(brandResolutionActionSchema)
  .handler(({ data, context }) =>
    BrandResolutionService.applyManualAction(
      { ...data, projectId: context.projectId },
      context.userId,
    ),
  );
