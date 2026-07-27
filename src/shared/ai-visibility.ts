import { z } from "zod";

const AI_VISIBILITY_RETENTION_DAYS = 400;

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
