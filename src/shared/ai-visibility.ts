import { z } from "zod";

const AI_VISIBILITY_RETENTION_DAYS = 400;
export const AI_TRACKED_RUN_DEFAULT_CALL_CAP = 200;
export const AI_TRACKED_RUN_MAX_CALL_CAP = 2_000;
export const AI_TRACKED_RUN_BATCH_SIZE = 4;

const AI_RUN_CADENCES = ["daily", "weekly", "monthly", "manual"] as const;
export const aiRunCadenceSchema = z.enum(AI_RUN_CADENCES);
type AiRunCadence = z.infer<typeof aiRunCadenceSchema>;

export function aiVisibilityRetentionCutoff(now = new Date()): string {
  return new Date(
    now.getTime() - AI_VISIBILITY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

/**
 * Provider/model identifiers are deliberately open-ended. The database stores
 * text and this boundary validator admits new upstream models without a schema
 * migration; Phase 1 decides which identifiers are enabled and billable.
 */
export const aiVisibilityModelSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._:/-]*$/i);

export function aiRunWindowStartedAt(
  cadence: AiRunCadence,
  now = new Date(),
): string {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);

  if (cadence === "weekly") {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  } else if (cadence === "monthly" || cadence === "manual") {
    start.setUTCDate(1);
  }

  return start.toISOString();
}

function addCadence(
  cadence: Exclude<AiRunCadence, "manual">,
  value: Date,
): Date {
  const next = new Date(value);
  if (cadence === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    const originalDay = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const followingMonth = new Date(next);
    followingMonth.setUTCMonth(followingMonth.getUTCMonth() + 1);
    followingMonth.setUTCDate(0);
    next.setUTCDate(Math.min(originalDay, followingMonth.getUTCDate()));
  }
  return next;
}

export function computeNextAiRunAt(
  cadence: AiRunCadence,
  scheduledFor: string | null,
  now = new Date(),
): string | null {
  if (cadence === "manual") return null;

  let next = scheduledFor ? new Date(scheduledFor) : new Date(now);
  if (Number.isNaN(next.getTime())) next = new Date(now);

  do {
    next = addCadence(cadence, next);
  } while (next.getTime() <= now.getTime());

  return next.toISOString();
}

export function countAiAnswerCalls(
  promptCount: number,
  modelCount: number,
): number {
  if (
    !Number.isSafeInteger(promptCount) ||
    promptCount < 0 ||
    !Number.isSafeInteger(modelCount) ||
    modelCount < 0
  ) {
    throw new Error("Prompt and model counts must be non-negative integers");
  }
  const calls = promptCount * modelCount;
  if (!Number.isSafeInteger(calls)) {
    throw new Error("Prompt/model call count exceeds the safe integer range");
  }
  return calls;
}
