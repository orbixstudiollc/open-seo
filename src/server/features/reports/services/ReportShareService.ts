import type { ReportRuntimeEnv } from "./reportSharingPolicy";
import { getReportSharingPolicy } from "./reportSharingPolicy";
import { ReportRepository } from "../repositories/ReportRepository";
import {
  createReportBearerToken,
  digestReportBearerToken,
} from "./reportTokens";
import { visibilityWindowSchema } from "@/types/schemas/ai-visibility-analytics";
import type { ReportShareSummary } from "@/types/schemas/reports";
import { REPORT_CONTRACT_VERSION } from "@/types/schemas/reports";
import { AppError } from "@/server/lib/errors";

const DAY_MS = 24 * 60 * 60 * 1_000;

type ShareRepository = Pick<
  typeof ReportRepository,
  "createShare" | "findActiveShareByDigest" | "listShares" | "revokeShare"
>;

export async function createReportShare(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  windowDays: 7 | 30 | 90;
  expiresInDays: 1 | 7 | 30;
  purpose?: "manual" | "digest";
  now?: Date;
  env: ReportRuntimeEnv;
  repository?: ShareRepository;
}) {
  const policy = getReportSharingPolicy(input.env);
  if (!policy.enabled) {
    throw new AppError("VALIDATION_ERROR", policy.reason);
  }

  const now = input.now ?? new Date();
  const repository = input.repository ?? ReportRepository;
  const bearer = await createReportBearerToken();
  const expiresAt = new Date(
    now.getTime() + input.expiresInDays * DAY_MS,
  ).toISOString();
  const share = await repository.createShare({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    organizationId: input.organizationId,
    tokenDigest: bearer.digest,
    reportVersion: REPORT_CONTRACT_VERSION,
    windowDays: input.windowDays,
    purpose: input.purpose ?? "manual",
    createdBy: input.userId,
    createdAt: now.toISOString(),
    expiresAt,
  });

  return {
    id: share.id,
    token: bearer.token,
    expiresAt,
  };
}

export async function resolveReportShare(input: {
  token: string;
  now?: Date;
  env: ReportRuntimeEnv;
  repository?: ShareRepository;
}) {
  if (!getReportSharingPolicy(input.env).enabled) return null;

  const tokenDigest = await digestReportBearerToken(input.token);
  if (!tokenDigest) return null;
  const now = input.now ?? new Date();
  const share = await (
    input.repository ?? ReportRepository
  ).findActiveShareByDigest({
    tokenDigest,
    now: now.toISOString(),
  });
  if (!share) return null;

  const windowDays = visibilityWindowSchema.safeParse(share.windowDays);
  if (!windowDays.success || share.reportVersion !== REPORT_CONTRACT_VERSION) {
    return null;
  }

  return {
    shareId: share.shareId,
    expiresAt: share.expiresAt,
    windowDays: windowDays.data,
    project: {
      id: share.projectId,
      name: share.projectName,
      domain: share.projectDomain,
    },
  };
}

export async function listReportShares(input: {
  projectId: string;
  organizationId: string;
  now?: Date;
  repository?: ShareRepository;
}): Promise<ReportShareSummary[]> {
  const nowIso = (input.now ?? new Date()).toISOString();
  const rows = await (input.repository ?? ReportRepository).listShares(input);
  return rows.map((row) => ({
    id: row.id,
    windowDays: visibilityWindowSchema.parse(row.windowDays),
    purpose: row.purpose,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    status: row.revokedAt
      ? "revoked"
      : row.expiresAt <= nowIso
        ? "expired"
        : "active",
  }));
}

export async function revokeReportShare(input: {
  shareId: string;
  projectId: string;
  organizationId: string;
  now?: Date;
  repository?: ShareRepository;
}) {
  const revoked = await (input.repository ?? ReportRepository).revokeShare({
    shareId: input.shareId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    revokedAt: (input.now ?? new Date()).toISOString(),
  });
  if (!revoked) throw new AppError("NOT_FOUND");
}
