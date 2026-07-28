import { ReportRepository } from "../repositories/ReportRepository";
import { buildProjectReport } from "./ReportService";
import { createReportShare, revokeReportShare } from "./ReportShareService";
import { sendReportDigestEmail } from "./reportDigestEmail";
import {
  getReportPublicOrigin,
  getReportSharingPolicy,
  isReportDigestDeliveryConfigured,
  type ReportRuntimeEnv,
} from "./reportSharingPolicy";
import { visibilityWindowSchema } from "@/types/schemas/ai-visibility-analytics";
import type { ReportDigestSettings } from "@/types/schemas/reports";
import { AppError } from "@/server/lib/errors";

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

export function computeNextDigestAt(
  previousNextSendAt: string | null,
  now: Date,
) {
  const parsed = previousNextSendAt
    ? new Date(previousNextSendAt).getTime()
    : Number.NaN;
  let next = Number.isFinite(parsed)
    ? parsed + WEEK_MS
    : now.getTime() + WEEK_MS;
  while (next <= now.getTime()) next += WEEK_MS;
  return new Date(next).toISOString();
}

export async function getReportDigestSettings(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  env: ReportRuntimeEnv;
}): Promise<ReportDigestSettings> {
  const row = await ReportRepository.getDigestSchedule(input);
  const policy = getReportSharingPolicy(input.env);
  return {
    enabled: row?.enabled ?? false,
    windowDays: visibilityWindowSchema.parse(row?.windowDays ?? 30),
    cadence: "weekly",
    recipientEmail: row?.recipientEmail ?? input.userEmail,
    nextSendAt: row?.nextSendAt ?? null,
    lastSentAt: row?.lastSentAt ?? null,
    lastError: row?.lastError ?? null,
    deliveryConfigured: isReportDigestDeliveryConfigured(input.env),
    sharingEnabled: policy.enabled,
    sharingDisabledReason: policy.reason,
  };
}

export async function saveReportDigestSettings(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  enabled: boolean;
  windowDays: 7 | 30 | 90;
  env: ReportRuntimeEnv;
  now?: Date;
}) {
  const policy = getReportSharingPolicy(input.env);
  if (input.enabled && !policy.enabled) {
    throw new AppError("VALIDATION_ERROR", policy.reason);
  }
  if (input.enabled && !isReportDigestDeliveryConfigured(input.env)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Report digest delivery is not configured.",
    );
  }

  const now = input.now ?? new Date();
  const existing = await ReportRepository.getDigestSchedule(input);
  const nextSendAt = input.enabled
    ? existing?.enabled && existing.nextSendAt
      ? existing.nextSendAt
      : computeNextDigestAt(null, now)
    : null;
  await ReportRepository.upsertDigestSchedule({
    id: existing?.id ?? crypto.randomUUID(),
    projectId: input.projectId,
    organizationId: input.organizationId,
    userId: input.userId,
    recipientEmail: input.userEmail,
    windowDays: input.windowDays,
    enabled: input.enabled,
    nextSendAt,
    updatedAt: now.toISOString(),
  });

  return getReportDigestSettings(input);
}

type DigestRepository = Pick<
  typeof ReportRepository,
  | "getDueDigestSchedules"
  | "claimDigestSchedule"
  | "recordDigestSuccess"
  | "recordDigestFailure"
>;

export type DigestDependencies = {
  repository: DigestRepository;
  buildReport: typeof buildProjectReport;
  createShare: typeof createReportShare;
  revokeShare: typeof revokeReportShare;
  sendEmail: typeof sendReportDigestEmail;
};

const defaultDependencies: DigestDependencies = {
  repository: ReportRepository,
  buildReport: buildProjectReport,
  createShare: createReportShare,
  revokeShare: revokeReportShare,
  sendEmail: sendReportDigestEmail,
};

export async function runScheduledReportDigests(
  env: ReportRuntimeEnv,
  dependencies: DigestDependencies = defaultDependencies,
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const publicOrigin = getReportPublicOrigin(env);
  if (
    !publicOrigin ||
    !getReportSharingPolicy(env).enabled ||
    !isReportDigestDeliveryConfigured(env)
  ) {
    return { due: 0, sent: 0, failed: 0, skipped: "not_configured" } as const;
  }

  const due = await dependencies.repository.getDueDigestSchedules(nowIso);
  let sent = 0;
  let failed = 0;
  for (const schedule of due) {
    if (!schedule.nextSendAt) continue;
    const nextSendAt = computeNextDigestAt(schedule.nextSendAt, now);
    const claimed = await dependencies.repository.claimDigestSchedule({
      id: schedule.id,
      expectedNextSendAt: schedule.nextSendAt,
      now: nowIso,
      nextSendAt,
    });
    if (!claimed) continue;

    let createdShareId: string | null = null;
    try {
      const windowDays = visibilityWindowSchema.parse(schedule.windowDays);
      const report = await dependencies.buildReport({
        project: {
          id: schedule.projectId,
          name: schedule.projectName,
          domain: schedule.projectDomain,
        },
        windowDays,
        asOf: now,
      });
      const share = await dependencies.createShare({
        projectId: schedule.projectId,
        organizationId: schedule.organizationId,
        userId: schedule.userId,
        windowDays,
        expiresInDays: 7,
        purpose: "digest",
        now,
        env,
      });
      createdShareId = share.id;
      await dependencies.sendEmail({
        env,
        email: schedule.recipientEmail,
        report,
        reportUrl: `${publicOrigin}/share/${share.token}`,
      });
      await dependencies.repository.recordDigestSuccess(schedule.id, nowIso);
      sent += 1;
    } catch (error) {
      if (createdShareId) {
        await dependencies
          .revokeShare({
            shareId: createdShareId,
            projectId: schedule.projectId,
            organizationId: schedule.organizationId,
            now,
          })
          .catch(() => undefined);
      }
      await dependencies.repository.recordDigestFailure(
        schedule.id,
        nowIso,
        "delivery_failed",
      );
      failed += 1;
      console.error("[cron] Report digest delivery failed", {
        scheduleId: schedule.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  return { due: due.length, sent, failed, skipped: null } as const;
}
