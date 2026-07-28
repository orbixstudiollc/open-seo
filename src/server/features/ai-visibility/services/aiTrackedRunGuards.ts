import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import type {
  AiTrackedRunParams,
  AiTrackedRunStartResult,
} from "@/server/features/ai-visibility/services/aiTrackedRunTypes";
import {
  aiRunCadenceSchema,
  aiRunWindowStartedAt,
  countAiAnswerCalls,
} from "@/shared/ai-visibility";
import { AppError } from "@/server/lib/errors";
import { promptExplorerModelSchema } from "@/types/schemas/ai-search";

type RunRow = Awaited<ReturnType<typeof AiVisibilityRepository.getRunById>>;
type WorkflowStatus = {
  status:
    | "queued"
    | "running"
    | "paused"
    | "errored"
    | "terminated"
    | "complete"
    | "waiting"
    | "waitingForPause"
    | "unknown";
  error?: { message: string };
};

export type AiTrackedRunWorkflowBinding = {
  create: (options: {
    id: string;
    params: AiTrackedRunParams;
  }) => Promise<unknown>;
  get: (id: string) => Promise<{
    status: () => Promise<WorkflowStatus>;
    terminate: () => Promise<void>;
  }>;
};

const ACTIVE_WORKFLOW_STATUSES = new Set<WorkflowStatus["status"]>([
  "queued",
  "running",
  "waiting",
  "waitingForPause",
  "paused",
]);
const WORKFLOW_STARTUP_GRACE_MS = 60_000;

async function getWorkflowStatus(
  workflow: AiTrackedRunWorkflowBinding,
  runId: string,
): Promise<WorkflowStatus | null> {
  try {
    return await (await workflow.get(runId)).status();
  } catch {
    return null;
  }
}

async function getStaleReason(input: {
  workflow: AiTrackedRunWorkflowBinding;
  run: NonNullable<RunRow>;
  ageMs: number;
}) {
  const status = await getWorkflowStatus(input.workflow, input.run.id);
  if (status && ACTIVE_WORKFLOW_STATUSES.has(status.status)) return null;

  const inStartupWindow =
    input.ageMs < WORKFLOW_STARTUP_GRACE_MS &&
    (!status || status.status === "unknown");
  if (inStartupWindow) return null;
  if (!status) return "Workflow instance was not found";
  if (status.status === "errored" || status.status === "terminated") {
    return status.error?.message ?? `Workflow ${status.status}`;
  }
  if (status.status === "complete") {
    return "Workflow completed without finalizing the run";
  }
  return `Workflow is no longer active (${status.status})`;
}

export async function failAiRunIfActive(
  runId: string,
  reason: string,
  run?: RunRow,
) {
  const current = run ?? (await AiVisibilityRepository.getRunById(runId));
  if (!current || !["pending", "running"].includes(current.status)) {
    return;
  }
  await AiVisibilityRepository.updateRun(runId, {
    status: "failed",
    errorMessage: reason,
    completedAt: new Date().toISOString(),
  });
}

async function reconcileActiveAiRun(input: {
  workflow: AiTrackedRunWorkflowBinding;
  run: NonNullable<RunRow>;
}) {
  if (!["pending", "running"].includes(input.run.status)) return null;
  return getStaleReason({
    workflow: input.workflow,
    run: input.run,
    ageMs: Date.now() - new Date(input.run.startedAt).getTime(),
  });
}

export async function beginAiTrackedRun(input: {
  workflow: AiTrackedRunWorkflowBinding;
  promptSetId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  trigger: "manual" | "scheduled";
  trackedPromptId?: string;
  now?: Date;
}): Promise<AiTrackedRunStartResult> {
  const definition =
    await AiVisibilityRepository.getRunnablePromptSetDefinition(
      input.promptSetId,
    );
  if (!definition || definition.promptSet.projectId !== input.projectId) {
    throw new AppError("NOT_FOUND", "Tracked prompt set not found");
  }

  const models = Array.from(
    new Set(
      definition.models.map(({ model }) =>
        promptExplorerModelSchema.parse(model),
      ),
    ),
  );
  const runnablePrompts = input.trackedPromptId
    ? definition.prompts.filter(({ id }) => id === input.trackedPromptId)
    : definition.prompts;
  if (input.trackedPromptId && runnablePrompts.length === 0) {
    throw new AppError(
      "NOT_FOUND",
      "Tracked prompt is not active in this prompt set",
    );
  }
  const prompts = runnablePrompts.map(({ id, prompt }) => ({ id, prompt }));
  if (prompts.length === 0 || models.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A tracked run requires at least one prompt and one enabled model",
    );
  }

  const answerCalls = countAiAnswerCalls(prompts.length, models.length);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  for (let attempt = 0; attempt < 2; attempt++) {
    const runId = crypto.randomUUID();
    const inserted = await AiVisibilityRepository.tryCreateRun({
      id: runId,
      promptSetId: input.promptSetId,
      projectId: input.projectId,
      trigger: input.trigger,
      promptsTotal: prompts.length,
      answersExpected: answerCalls,
      startedAt: nowIso,
    });

    if (inserted) {
      const settings =
        await AiVisibilityRepository.getOrCreateProjectRunSettings(
          input.projectId,
        );
      const cadence = aiRunCadenceSchema.parse(settings.cadence);
      const windowStartedAt = aiRunWindowStartedAt(cadence, now);
      const reservation =
        await AiVisibilityRepository.reserveProjectAnswerCalls({
          projectId: input.projectId,
          calls: answerCalls,
          windowStartedAt,
          now: nowIso,
        });

      if (!reservation.reserved) {
        await AiVisibilityRepository.updateRun(runId, {
          status: "failed",
          errorMessage: "Project tracked-run cap reached",
          completedAt: nowIso,
        });
        await AiVisibilityRepository.updatePromptSet(
          input.promptSetId,
          input.projectId,
          {
            lastSkipReason: "run_cap_reached",
            lastSkippedAt: nowIso,
          },
        );
        return {
          ok: false,
          reason: "run_cap_reached",
          requestedAnswerCalls: answerCalls,
          callsReserved: reservation.settings.callsReserved,
          answerCallCap: reservation.settings.answerCallCap,
          windowStartedAt,
        };
      }

      await AiVisibilityRepository.updateRun(runId, {
        reservedAnswerCalls: answerCalls,
        reservationWindowStartedAt: windowStartedAt,
      });

      const params: AiTrackedRunParams = {
        runId,
        promptSetId: input.promptSetId,
        projectId: input.projectId,
        trigger: input.trigger,
        billingCustomer: {
          ...input.billingCustomer,
          projectId: input.projectId,
        },
        prompts,
        models,
      };
      try {
        await input.workflow.create({ id: runId, params });
      } catch (error) {
        await failAiRunIfActive(
          runId,
          "Failed to start tracked prompt workflow",
        );
        await AiVisibilityRepository.updatePromptSet(
          input.promptSetId,
          input.projectId,
          {
            lastSkipReason: "workflow_start_failed",
            lastSkippedAt: nowIso,
          },
        );
        try {
          await (await input.workflow.get(runId)).terminate();
        } catch {
          // The instance may not have been created.
        }
        throw error;
      }

      return { ok: true, runId, answerCallsReserved: answerCalls };
    }

    const blocker = await AiVisibilityRepository.getActiveRunForPromptSet(
      input.promptSetId,
    );
    if (!blocker) continue;
    if (attempt === 0) {
      const staleReason = await reconcileActiveAiRun({
        workflow: input.workflow,
        run: blocker,
      });
      if (staleReason) {
        await failAiRunIfActive(blocker.id, staleReason, blocker);
        continue;
      }
    }
    return {
      ok: false,
      reason: "already_running",
      blockingRunId: blocker.id,
    };
  }

  const blocker = await AiVisibilityRepository.getActiveRunForPromptSet(
    input.promptSetId,
  );
  return {
    ok: false,
    reason: "already_running",
    blockingRunId: blocker?.id ?? null,
  };
}
