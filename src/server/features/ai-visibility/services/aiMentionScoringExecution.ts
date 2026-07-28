import { AiVisibilityRepository } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import {
  resolveChatProviderSync,
  type ChatProviderConfig,
} from "@/server/lib/chatProvider";
import { getEnvValueSync, getWorkersEnvRecord } from "@/server/lib/runtime-env";
import { detectRegisteredBrandMentions } from "./mentionDetection";
import {
  calculateScoringCost,
  MENTION_SCORING_PROMPT_VERSION,
  requestMentionSentiments,
  resolveCustomScoringPricing,
  scoringErrorCode,
  type SentimentScoringResult,
} from "./mentionScoring";
import type { AiAnswerWork } from "./aiTrackedRunExecution";

type Repository = Pick<
  typeof AiVisibilityRepository,
  | "getAnswerById"
  | "getBrandRegistry"
  | "insertBrandMentions"
  | "getBrandMentionsForAnswer"
  | "getMentionScoringAttempt"
  | "tryCreateMentionScoringAttempt"
  | "completeMentionScoring"
>;

export type AiMentionScoringDependencies = {
  repository: Repository;
  loadEnv: () => Promise<Record<string, unknown> | null>;
  score: (
    config: ChatProviderConfig,
    input: {
      answerText: string;
      mentions: Array<{ mentionId: string; brandName: string }>;
    },
  ) => Promise<SentimentScoringResult>;
  createId: () => string;
  now: () => Date;
};

const defaultDependencies: AiMentionScoringDependencies = {
  repository: AiVisibilityRepository,
  loadEnv: getWorkersEnvRecord,
  score: requestMentionSentiments,
  createId: () => crypto.randomUUID(),
  now: () => new Date(),
};

export async function executeAiMentionScoring(
  work: AiAnswerWork,
  projectId: string,
  dependencies: AiMentionScoringDependencies = defaultDependencies,
) {
  const answer = await dependencies.repository.getAnswerById(
    work.answerId,
    work.runId,
  );
  if (answer?.status !== "success" || !answer.responseText) {
    return { status: "not_scored" as const, reason: "answer_not_successful" };
  }

  const registry = await dependencies.repository.getBrandRegistry(projectId);
  const detected = detectRegisteredBrandMentions(answer.responseText, registry);
  await dependencies.repository.insertBrandMentions(
    detected.map((mention) => ({
      answerId: answer.id,
      rawName: mention.rawName,
      normalizedName: mention.normalizedName,
      brandId: mention.brandId,
      mentionCount: mention.mentionCount,
      position: mention.position,
      firstOccurrenceStart: mention.firstOccurrenceStart,
      firstOccurrenceEnd: mention.firstOccurrenceEnd,
      scoringStatus: "pending",
    })),
  );

  const mentions = (
    await dependencies.repository.getBrandMentionsForAnswer(answer.id)
  ).filter(
    (mention) =>
      mention.brandId != null &&
      mention.position != null &&
      mention.scoringStatus === "pending",
  );
  if (mentions.length === 0) {
    return { status: "not_scored" as const, reason: "no_mentions" };
  }

  const existing = await dependencies.repository.getMentionScoringAttempt(
    answer.id,
    MENTION_SCORING_PROMPT_VERSION,
  );
  if (existing) {
    if (existing.status === "running") {
      await dependencies.repository.completeMentionScoring({
        attemptId: existing.id,
        answerId: answer.id,
        status: "failed",
        completedAt: dependencies.now().toISOString(),
        inputTokens: existing.inputTokens,
        outputTokens: existing.outputTokens,
        costUsd: existing.costUsd,
        costBasis: existing.costBasis,
        errorCode: "REPLAY_INDETERMINATE",
      });
    }
    return { status: "replayed" as const, attemptStatus: existing.status };
  }

  const env = (await dependencies.loadEnv()) ?? {};
  const provider = resolveChatProviderSync(env);
  if (!provider.ok) {
    return finishSkippedAttempt({
      work,
      answerId: answer.id,
      env,
      errorCode: "SCORING_PROVIDER_NOT_CONFIGURED",
      dependencies,
    });
  }

  const customPricing =
    provider.config.kind === "custom" ? resolveCustomScoringPricing(env) : null;
  if (provider.config.kind === "custom" && !customPricing) {
    return finishSkippedAttempt({
      work,
      answerId: answer.id,
      env,
      config: provider.config,
      errorCode: "CUSTOM_SCORING_PRICING_REQUIRED",
      dependencies,
    });
  }

  const attemptId = dependencies.createId();
  const startedAt = dependencies.now().toISOString();
  const inserted = await dependencies.repository.tryCreateMentionScoringAttempt(
    {
      id: attemptId,
      answerId: answer.id,
      runId: work.runId,
      providerKind: provider.config.kind,
      modelId: provider.config.modelId,
      promptVersion: MENTION_SCORING_PROMPT_VERSION,
      status: "running",
      costBasis: "unknown",
      inputUsdPerMillion: customPricing?.inputUsdPerMillion ?? null,
      outputUsdPerMillion: customPricing?.outputUsdPerMillion ?? null,
      startedAt,
    },
  );
  if (!inserted) {
    return { status: "replayed" as const, attemptStatus: "running" as const };
  }

  const brandNames = new Map(
    registry.brands.map((brand) => [brand.id, brand.name]),
  );
  try {
    const result = await dependencies.score(provider.config, {
      answerText: answer.responseText,
      mentions: mentions.map((mention) => ({
        mentionId: String(mention.id),
        brandName: brandNames.get(mention.brandId!) ?? mention.rawName,
      })),
    });
    const cost = calculateScoringCost({
      config: provider.config,
      usage: result.usage,
      providerMetadata: result.providerMetadata,
      customPricing,
    });
    const completedAt = dependencies.now().toISOString();
    if (result.status === "invalid") {
      await dependencies.repository.completeMentionScoring({
        attemptId,
        answerId: answer.id,
        status: "failed",
        completedAt,
        ...cost,
        errorCode: result.errorCode ?? "INVALID_SCORING_OUTPUT",
      });
      return { status: "failed" as const, ...cost };
    }

    await dependencies.repository.completeMentionScoring({
      attemptId,
      answerId: answer.id,
      status: "success",
      completedAt,
      ...cost,
      errorCode: null,
      sentiments: result.sentiments.map((sentiment) => ({
        mentionId: Number(sentiment.mentionId),
        sentiment: sentiment.sentiment,
      })),
    });
    return { status: "success" as const, ...cost };
  } catch (error) {
    await dependencies.repository.completeMentionScoring({
      attemptId,
      answerId: answer.id,
      status: "failed",
      completedAt: dependencies.now().toISOString(),
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      costBasis: "unknown",
      errorCode: scoringErrorCode(error),
    });
    console.error(
      `ai-visibility.answer.${work.model}.mention_scoring_error run=${work.runId}:`,
      error,
    );
    return { status: "failed" as const, costBasis: "unknown" as const };
  }
}

async function finishSkippedAttempt(input: {
  work: AiAnswerWork;
  answerId: string;
  env: object;
  config?: ChatProviderConfig;
  errorCode: string;
  dependencies: AiMentionScoringDependencies;
}) {
  const providerKind =
    input.config?.kind ??
    (getEnvValueSync(input.env, "AI_BASE_URL") ? "custom" : "openrouter");
  const modelId =
    input.config?.modelId ??
    getEnvValueSync(
      input.env,
      providerKind === "custom" ? "AI_MODEL" : "OPENROUTER_MODEL",
    ) ??
    "unconfigured";
  const attemptId = input.dependencies.createId();
  const startedAt = input.dependencies.now().toISOString();
  const inserted =
    await input.dependencies.repository.tryCreateMentionScoringAttempt({
      id: attemptId,
      answerId: input.answerId,
      runId: input.work.runId,
      providerKind,
      modelId,
      promptVersion: MENTION_SCORING_PROMPT_VERSION,
      status: "running",
      costBasis: "unknown",
      startedAt,
    });
  if (!inserted) {
    return { status: "replayed" as const, attemptStatus: "running" as const };
  }
  await input.dependencies.repository.completeMentionScoring({
    attemptId,
    answerId: input.answerId,
    status: "skipped",
    completedAt: input.dependencies.now().toISOString(),
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    costBasis: "unknown",
    errorCode: input.errorCode,
  });
  return { status: "skipped" as const, reason: input.errorCode };
}
