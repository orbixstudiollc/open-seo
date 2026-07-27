import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import type {
  AiTrackedPromptSnapshot,
  AiTrackedRunParams,
} from "@/server/features/ai-visibility/services/aiTrackedRunTypes";
import {
  extractCitations,
  extractText,
  PROMPT_EXPLORER_MODEL_NAMES,
  PROMPT_RESPONSE_MAX_TOKENS,
} from "@/server/features/ai-search/services/promptExplorer";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { DataforseoPostSpendTrackingError } from "@/server/lib/dataforseo/client";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import type { PromptExplorerModel } from "@/types/schemas/ai-search";

export type AiAnswerWork = {
  answerId: string;
  runId: string;
  prompt: AiTrackedPromptSnapshot;
  model: PromptExplorerModel;
};

function aiAnswerId(
  runId: string,
  promptId: string,
  model: PromptExplorerModel,
) {
  return `${runId}:${promptId}:${model}`;
}

export async function prepareAiTrackedRun(
  params: AiTrackedRunParams,
): Promise<AiAnswerWork[]> {
  const [run, definition] = await Promise.all([
    AiVisibilityRepository.getRunById(params.runId),
    AiVisibilityRepository.getPromptSetDefinition(params.promptSetId),
  ]);
  if (
    !run ||
    !["pending", "running"].includes(run.status) ||
    !definition ||
    definition.promptSet.projectId !== params.projectId ||
    !definition.promptSet.isActive ||
    definition.promptSet.archivedAt
  ) {
    throw new AppError(
      "CONFLICT",
      `Tracked run ${params.runId} is no longer active`,
    );
  }

  const work = params.prompts.flatMap((prompt) =>
    params.models.map((model) => ({
      answerId: aiAnswerId(params.runId, prompt.id, model),
      runId: params.runId,
      prompt,
      model,
    })),
  );
  await AiVisibilityRepository.createAnswerPlaceholders(
    work.map((item) => ({
      id: item.answerId,
      runId: item.runId,
      trackedPromptId: item.prompt.id,
      promptText: item.prompt.prompt,
      model: item.model,
      status: "pending",
      fromCache: false,
    })),
  );
  await AiVisibilityRepository.updateRun(params.runId, {
    status: "running",
    promptsTotal: params.prompts.length,
    answersExpected: work.length,
  });
  return work;
}

function errorBilling(error: unknown): {
  billingPath: string | null;
  providerCostUsd: number;
  creditsConsumed: number | null;
} {
  if (error instanceof DataforseoChargedTaskError) {
    return {
      billingPath: `/${error.billing.path.join("/")}`,
      providerCostUsd: error.billing.costUsd,
      creditsConsumed: error.creditsConsumed,
    };
  }
  if (error instanceof DataforseoPostSpendTrackingError) {
    return {
      billingPath: `/${error.billing.path.join("/")}`,
      providerCostUsd: error.billing.costUsd,
      creditsConsumed: null,
    };
  }
  return {
    billingPath: null,
    providerCostUsd: 0,
    creditsConsumed: 0,
  };
}

function errorCode(error: unknown) {
  return error instanceof AppError ? error.code : "UPSTREAM_ERROR";
}

export async function executeAiAnswerWork(
  work: AiAnswerWork,
  billingCustomer: BillingCustomerContext,
) {
  const current = await AiVisibilityRepository.getAnswerById(
    work.answerId,
    work.runId,
  );
  if (!current) throw new Error(`Missing answer placeholder ${work.answerId}`);
  if (current.status === "success" || current.status === "error") {
    return { status: current.status, replayed: true };
  }

  const nowIso = new Date().toISOString();
  const claimed = await AiVisibilityRepository.claimPendingAnswer(
    work.answerId,
    work.runId,
    nowIso,
  );
  if (!claimed) {
    // The provider may already have accepted the previous attempt. Never issue
    // a second paid call when the durable result is indeterminate.
    await AiVisibilityRepository.completeRunningAnswer(
      work.answerId,
      work.runId,
      {
        status: "error",
        errorCode: "REPLAY_INDETERMINATE",
        errorMessage:
          "A prior provider attempt did not persist a terminal result; skipped to prevent duplicate spend",
        providerCostUsd: current.providerCostUsd,
        creditsConsumed: current.creditsConsumed,
        observedAt: nowIso,
        completedAt: nowIso,
      },
    );
    return { status: "error" as const, replayed: true };
  }

  const client = createDataforseoClient(billingCustomer);
  try {
    const result = await client.aiSearch.llmResponseWithBilling({
      modelSlug: work.model,
      modelName: PROMPT_EXPLORER_MODEL_NAMES[work.model],
      userPrompt: work.prompt.prompt,
      webSearch: true,
      maxOutputTokens: PROMPT_RESPONSE_MAX_TOKENS,
    });
    const citations = extractCitations(result.data);
    await AiVisibilityRepository.completeRunningAnswer(
      work.answerId,
      work.runId,
      {
        status: "success",
        modelName: result.data.model_name ?? null,
        responseText: extractText(result.data),
        sourceFetchedAt: nowIso,
        observedAt: nowIso,
        outputTokens:
          result.data.output_tokens == null
            ? null
            : Math.round(result.data.output_tokens),
        webSearch: result.data.web_search ?? true,
        fromCache: false,
        billingPath: `/${result.billing.path.join("/")}`,
        providerCostUsd: result.billing.costUsd,
        creditsConsumed: result.creditsConsumed,
        completedAt: nowIso,
      },
    );
    try {
      await AiVisibilityRepository.insertCitations(
        citations.map((citation, citationOrder) => ({
          answerId: work.answerId,
          citationOrder,
          url: citation.url,
          domain: citation.domain,
          title: citation.title,
        })),
      );
    } catch (error) {
      // Preserve the paid response and billing envelope even if optional
      // citation persistence fails. The tuple is terminal, so Workflow replay
      // cannot issue the paid request again.
      console.error(
        `ai-visibility.answer.${work.model}.citations_error run=${work.runId}:`,
        error,
      );
    }
    return { status: "success" as const, replayed: false };
  } catch (error) {
    const billing = errorBilling(error);
    await AiVisibilityRepository.completeRunningAnswer(
      work.answerId,
      work.runId,
      {
        status: "error",
        errorCode: errorCode(error),
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 1_000)
            : "Unknown provider error",
        ...billing,
        observedAt: nowIso,
        completedAt: nowIso,
      },
    );
    console.error(
      `ai-visibility.answer.${work.model}.error run=${work.runId}:`,
      error,
    );
    return { status: "error" as const, replayed: false };
  }
}

export async function finalizeAiTrackedRun(params: AiTrackedRunParams) {
  const firstPass = await AiVisibilityRepository.getAnswersForRun(params.runId);
  const completedAt = new Date().toISOString();
  for (const answer of firstPass) {
    if (answer.status !== "pending" && answer.status !== "running") continue;
    if (answer.status === "pending") {
      const claimed = await AiVisibilityRepository.claimPendingAnswer(
        answer.id,
        params.runId,
        completedAt,
      );
      if (!claimed) continue;
    }
    await AiVisibilityRepository.completeRunningAnswer(
      answer.id,
      params.runId,
      {
        status: "error",
        errorCode: "INCOMPLETE_WORK",
        errorMessage: "Answer work did not reach a terminal state",
        providerCostUsd: answer.providerCostUsd ?? 0,
        creditsConsumed: answer.creditsConsumed ?? 0,
        observedAt: completedAt,
        completedAt,
      },
    );
  }

  const answers = await AiVisibilityRepository.getAnswersForRun(params.runId);
  const succeeded = answers.filter((answer) => answer.status === "success");
  const failed = answers.filter((answer) => answer.status === "error");
  const promptsCompleted = new Set(
    answers
      .filter(
        (answer) => answer.status === "success" || answer.status === "error",
      )
      .map((answer) => answer.trackedPromptId),
  ).size;
  const providerCostUsd =
    Math.round(
      answers.reduce(
        (total, answer) => total + (answer.providerCostUsd ?? 0),
        0,
      ) * 1_000_000,
    ) / 1_000_000;
  const hasUnknownCredits = answers.some(
    (answer) =>
      (answer.providerCostUsd ?? 0) > 0 && answer.creditsConsumed == null,
  );
  const creditsConsumed = hasUnknownCredits
    ? null
    : answers.reduce(
        (total, answer) => total + (answer.creditsConsumed ?? 0),
        0,
      );
  const status =
    succeeded.length === answers.length
      ? "completed"
      : succeeded.length > 0
        ? "partial"
        : "failed";
  const errorMessage =
    failed.length > 0
      ? `${failed.length} of ${answers.length} model answers failed`
      : null;

  await AiVisibilityRepository.updateRun(params.runId, {
    status,
    promptsCompleted,
    answersSucceeded: succeeded.length,
    answersFailed: failed.length,
    providerCostUsd,
    creditsConsumed,
    errorMessage,
    completedAt,
  });
  await AiVisibilityRepository.updatePromptSet(
    params.promptSetId,
    params.projectId,
    {
      lastRunAt: completedAt,
      lastSkipReason: null,
      lastSkippedAt: null,
      updatedAt: completedAt,
    },
  );

  console.log(
    `[ai-visibility] ${params.runId} ${status} trigger=${params.trigger} answers=${succeeded.length}/${answers.length} provider_usd=${providerCostUsd} credits=${creditsConsumed ?? "unknown"}`,
  );
  await captureServerEvent({
    distinctId: params.billingCustomer.userId,
    event: "ai_visibility:run_complete",
    organizationId: params.billingCustomer.organizationId,
    properties: {
      project_id: params.projectId,
      prompt_set_id: params.promptSetId,
      run_id: params.runId,
      trigger: params.trigger,
      status,
      answers_expected: answers.length,
      answers_succeeded: succeeded.length,
      answers_failed: failed.length,
      provider_cost_usd: providerCostUsd,
      credits_consumed: creditsConsumed,
    },
  });

  return {
    status,
    answersSucceeded: succeeded.length,
    answersFailed: failed.length,
  };
}
