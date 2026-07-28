import { createServerFn } from "@tanstack/react-start";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import { explorePrompt as runExplorePrompt } from "@/server/features/ai-search/services/promptExplorer";
import { AiVisibilityService } from "@/server/features/ai-visibility/services/AiVisibilityService";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  aiProjectRunSettingsInputSchema,
  archiveAiPromptSetInputSchema,
  assignAiPromptTagInputSchema,
  brandLookupInputSchema,
  createAiPromptSetInputSchema,
  createAiPromptTagInputSchema,
  createAiPromptTopicInputSchema,
  createAiTrackedPromptInputSchema,
  promptExplorerInputSchema,
  runAiPromptSetInputSchema,
  runAiTrackedPromptInputSchema,
  updateAiPromptSetInputSchema,
  updateAiPromptTagInputSchema,
  updateAiPromptTopicInputSchema,
  updateAiTrackedPromptInputSchema,
} from "@/types/schemas/ai-search";
import { z } from "zod";

/**
 * AI Visibility endpoints are gated behind the paid plan in hosted mode
 * because each call fans out to several paid DataForSEO requests. Self-hosted
 * deployments pay DataForSEO directly and aren't gated.
 */
async function assertPaidPlan(organizationId: string) {
  if (!(await isHostedServerAuthMode())) return;
  if (await customerHasPaidPlan(organizationId)) return;
  throw new AppError(
    "PAYMENT_REQUIRED",
    "Upgrade to the paid plan to use AI Visibility",
  );
}

export const lookupBrand = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(brandLookupInputSchema)
  .handler(async ({ data, context }) => {
    await assertPaidPlan(context.organizationId);
    return getBrandLookup({ ...data, projectId: context.projectId }, context);
  });

export const explorePrompt = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(promptExplorerInputSchema)
  .handler(async ({ data, context }) => {
    await assertPaidPlan(context.organizationId);
    return runExplorePrompt({ ...data, projectId: context.projectId }, context);
  });

const trackedPromptStateInputSchema = z.object({
  projectId: z.string().min(1),
  promptSetId: z.string().min(1).optional(),
});

export const getTrackedPromptState = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(trackedPromptStateInputSchema)
  .handler(async ({ data, context }) =>
    data.promptSetId
      ? AiVisibilityService.getPromptSet(data.promptSetId, context.projectId)
      : AiVisibilityService.getPromptSets(context.projectId),
  );

export const getAiProjectRunSettings = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }) =>
    AiVisibilityService.getProjectRunSettings(context.projectId),
  );

export const updateAiProjectRunSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(aiProjectRunSettingsInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.updateProjectRunSettings({
      ...data,
      projectId: context.projectId,
    }),
  );

export const createAiPromptSet = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createAiPromptSetInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.createPromptSet({
      ...data,
      projectId: context.projectId,
    }),
  );

export const updateAiPromptSet = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateAiPromptSetInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.updatePromptSet({
      ...data,
      projectId: context.projectId,
    }),
  );

export const archiveAiPromptSet = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(archiveAiPromptSetInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.archivePromptSet({
      ...data,
      projectId: context.projectId,
    }),
  );

export const createAiPromptTopic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createAiPromptTopicInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.createTopic({
      ...data,
      projectId: context.projectId,
    }),
  );

export const updateAiPromptTopic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateAiPromptTopicInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.updateTopic({
      ...data,
      projectId: context.projectId,
    }),
  );

export const createAiTrackedPrompt = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createAiTrackedPromptInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.createTrackedPrompt({
      ...data,
      projectId: context.projectId,
    }),
  );

export const updateAiTrackedPrompt = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateAiTrackedPromptInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.updateTrackedPrompt({
      ...data,
      projectId: context.projectId,
    }),
  );

export const createAiPromptTag = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createAiPromptTagInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.createTag({
      ...data,
      projectId: context.projectId,
    }),
  );

export const updateAiPromptTag = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateAiPromptTagInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.updateTag({
      ...data,
      projectId: context.projectId,
    }),
  );

export const assignAiPromptTag = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(assignAiPromptTagInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.assignTag({
      ...data,
      projectId: context.projectId,
    }),
  );

export const runAiPromptSetNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runAiPromptSetInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.runPromptSet({
      promptSetId: data.promptSetId,
      projectId: context.projectId,
      billingCustomer: {
        userId: context.userId,
        userEmail: context.userEmail,
        organizationId: context.organizationId,
        projectId: context.projectId,
      },
    }),
  );

export const runAiTrackedPromptNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runAiTrackedPromptInputSchema)
  .handler(async ({ data, context }) =>
    AiVisibilityService.runTrackedPrompt({
      promptSetId: data.promptSetId,
      trackedPromptId: data.trackedPromptId,
      projectId: context.projectId,
      billingCustomer: {
        userId: context.userId,
        userEmail: context.userEmail,
        organizationId: context.organizationId,
        projectId: context.projectId,
      },
    }),
  );
