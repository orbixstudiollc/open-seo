import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { withPgClient } from "@/db";
import {
  executeAiAnswerWork,
  finalizeAiTrackedRun,
  prepareAiTrackedRun,
} from "@/server/features/ai-visibility/services/aiTrackedRunExecution";
import { failAiRunIfActive } from "@/server/features/ai-visibility/services/aiTrackedRunGuards";
import type { AiTrackedRunParams } from "@/server/features/ai-visibility/services/aiTrackedRunTypes";
import { pgStep } from "@/server/workflows/pgStep";
import { AI_TRACKED_RUN_BATCH_SIZE } from "@/shared/ai-visibility";

const STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "3 minutes" as const,
};

export class AiTrackedRunWorkflow extends WorkflowEntrypoint<
  Env,
  AiTrackedRunParams
> {
  async run(event: WorkflowEvent<AiTrackedRunParams>, step: WorkflowStep) {
    return withPgClient(() => runAiTrackedRunWorkflow(event.payload, step));
  }
}

export async function runAiTrackedRunWorkflow(
  params: AiTrackedRunParams,
  step: WorkflowStep,
) {
  try {
    const work = await pgStep(step, "prepare", STEP_CONFIG, () =>
      prepareAiTrackedRun(params),
    );

    for (
      let offset = 0;
      offset < work.length;
      offset += AI_TRACKED_RUN_BATCH_SIZE
    ) {
      const batch = work.slice(offset, offset + AI_TRACKED_RUN_BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map((item, batchIndex) =>
          pgStep(
            step,
            `answer-${offset + batchIndex}-${item.model}`,
            STEP_CONFIG,
            () => executeAiAnswerWork(item, params.billingCustomer),
          ),
        ),
      );
      for (const result of settled) {
        if (result.status === "rejected") {
          console.error(
            `[ai-visibility] ${params.runId} answer step failed:`,
            result.reason,
          );
        }
      }
    }

    await pgStep(step, "finalize", STEP_CONFIG, () =>
      finalizeAiTrackedRun(params),
    );
  } catch (error) {
    console.error(`AI tracked run ${params.runId} failed:`, error);
    await pgStep(step, "mark-failed", STEP_CONFIG, () =>
      failAiRunIfActive(
        params.runId,
        error instanceof Error ? error.message : "Unknown workflow error",
      ),
    );
    throw error;
  }
}
