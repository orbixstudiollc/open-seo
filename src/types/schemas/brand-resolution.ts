import { z } from "zod";

const projectId = z.string().uuid();
const normalizedNames = z
  .array(z.string().trim().min(1).max(160))
  .min(1)
  .max(20);
const reason = z.string().trim().min(3).max(500);
const canonicalName = z.string().trim().min(1).max(160);

export const brandResolutionStateInputSchema = z.object({
  projectId,
});

export const brandResolutionActionSchema = z.discriminatedUnion("action", [
  z.object({
    projectId,
    action: z.literal("merge"),
    normalizedNames,
    canonicalName,
    brandId: z.string().min(1).optional(),
    domain: z.string().trim().min(1).max(253).optional(),
    reason,
  }),
  z.object({
    projectId,
    action: z.enum(["split", "restore"]),
    normalizedNames,
    canonicalName,
    brandId: z.string().min(1).optional(),
    domain: z.string().trim().min(1).max(253).optional(),
    reason,
  }),
  z.object({
    projectId,
    action: z.literal("suppress"),
    normalizedNames,
    reason,
  }),
  z.object({
    projectId,
    action: z.literal("needs_review"),
    normalizedNames,
    reason,
  }),
]);

export type BrandResolutionAction = z.infer<typeof brandResolutionActionSchema>;
