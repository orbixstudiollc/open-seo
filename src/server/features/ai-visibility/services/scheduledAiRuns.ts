import { customerHasPaidPlan } from "@/server/billing/subscription";
import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import { beginAiTrackedRun } from "@/server/features/ai-visibility/services/aiTrackedRunGuards";
import type { AiTrackedRunWorkflowBinding } from "@/server/features/ai-visibility/services/aiTrackedRunGuards";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { aiRunCadenceSchema, computeNextAiRunAt } from "@/shared/ai-visibility";

async function recordScheduleState(input: {
  promptSetId: string;
  projectId: string;
  nextRunAt: string | null;
  nowIso: string;
  skipReason?:
    | "run_cap_reached"
    | "no_prompts"
    | "payment_required"
    | "already_running";
}) {
  await AiVisibilityRepository.updatePromptSet(
    input.promptSetId,
    input.projectId,
    {
      nextRunAt: input.nextRunAt,
      lastSkipReason: input.skipReason ?? null,
      lastSkippedAt: input.skipReason ? input.nowIso : null,
      updatedAt: input.nowIso,
    },
  );
}

export async function runScheduledAiTrackedRuns(env: {
  AI_TRACKED_RUN_WORKFLOW: AiTrackedRunWorkflowBinding;
}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const duePromptSets =
    await AiVisibilityRepository.getDuePromptSetsWithOrganization(nowIso);
  const isHosted = await isHostedServerAuthMode();

  for (const promptSet of duePromptSets) {
    try {
      const settings =
        await AiVisibilityRepository.getOrCreateProjectRunSettings(
          promptSet.projectId,
        );
      const cadence = aiRunCadenceSchema.parse(settings.cadence);
      const nextRunAt = computeNextAiRunAt(cadence, promptSet.nextRunAt, now);
      if (cadence === "manual") {
        await recordScheduleState({
          promptSetId: promptSet.id,
          projectId: promptSet.projectId,
          nextRunAt: null,
          nowIso,
        });
        continue;
      }

      if (isHosted && !(await customerHasPaidPlan(promptSet.organizationId))) {
        await recordScheduleState({
          promptSetId: promptSet.id,
          projectId: promptSet.projectId,
          nextRunAt,
          nowIso,
          skipReason: "payment_required",
        });
        continue;
      }

      const definition =
        await AiVisibilityRepository.getRunnablePromptSetDefinition(
          promptSet.id,
        );
      if (
        !definition ||
        definition.prompts.length === 0 ||
        definition.models.length === 0
      ) {
        await recordScheduleState({
          promptSetId: promptSet.id,
          projectId: promptSet.projectId,
          nextRunAt,
          nowIso,
          skipReason: "no_prompts",
        });
        continue;
      }

      // Eager advancement prevents cap/provider failures from retrying every
      // 15 minutes. The admission result below only changes the visible reason.
      await recordScheduleState({
        promptSetId: promptSet.id,
        projectId: promptSet.projectId,
        nextRunAt,
        nowIso,
      });

      const result = await beginAiTrackedRun({
        workflow: env.AI_TRACKED_RUN_WORKFLOW,
        promptSetId: promptSet.id,
        projectId: promptSet.projectId,
        billingCustomer: {
          userId: "system",
          userEmail: "system@openseo.so",
          organizationId: promptSet.organizationId,
          projectId: promptSet.projectId,
        },
        trigger: "scheduled",
        now,
      });
      if (!result.ok) {
        await recordScheduleState({
          promptSetId: promptSet.id,
          projectId: promptSet.projectId,
          nextRunAt,
          nowIso,
          skipReason:
            result.reason === "run_cap_reached"
              ? "run_cap_reached"
              : "already_running",
        });
        console.log(
          `[cron] Skipped tracked prompt set ${promptSet.id}: ${result.reason}`,
        );
      } else {
        console.log(
          `[cron] Started tracked prompt run ${result.runId} for set ${promptSet.id}`,
        );
      }
    } catch (error) {
      console.error(
        `[cron] Error processing tracked prompt set ${promptSet.id}:`,
        error,
      );
    }
  }

  try {
    await AiVisibilityRepository.pruneExpiredTerminalRuns({ now });
  } catch (error) {
    console.error("[cron] AI visibility retention prune failed:", error);
  }
}
