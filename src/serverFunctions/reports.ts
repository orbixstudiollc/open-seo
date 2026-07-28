import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { buildProjectReport } from "@/server/features/reports/services/ReportService";
import {
  createReportShare,
  listReportShares,
  revokeReportShare,
} from "@/server/features/reports/services/ReportShareService";
import {
  getReportDigestSettings,
  saveReportDigestSettings,
} from "@/server/features/reports/services/ReportDigestService";
import {
  getReportPublicOrigin,
  getReportSharingPolicy,
} from "@/server/features/reports/services/reportSharingPolicy";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  createReportShareInputSchema,
  reportInputSchema,
  reportProjectInputSchema,
  revokeReportShareInputSchema,
  saveReportDigestInputSchema,
} from "@/types/schemas/reports";

export const getProjectReport = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(reportInputSchema)
  .handler(({ data, context }) =>
    buildProjectReport({
      project: context.project,
      windowDays: data.windowDays,
    }),
  );

export const getReportShareState = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(reportProjectInputSchema)
  .handler(async ({ context }) => {
    const policy = getReportSharingPolicy(env);
    return {
      sharingEnabled: policy.enabled,
      sharingDisabledReason: policy.reason,
      shares: await listReportShares({
        projectId: context.projectId,
        organizationId: context.organizationId,
      }),
    };
  });

export const createProjectReportShare = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createReportShareInputSchema)
  .handler(async ({ data, context }) => {
    const share = await createReportShare({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      windowDays: data.windowDays,
      expiresInDays: data.expiresInDays,
      env,
    });
    const publicOrigin =
      getReportPublicOrigin(env) ?? getPublicOrigin(getRequest());
    return {
      id: share.id,
      expiresAt: share.expiresAt,
      url: `${publicOrigin}/share/${share.token}`,
    };
  });

export const revokeProjectReportShare = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(revokeReportShareInputSchema)
  .handler(async ({ data, context }) => {
    await revokeReportShare({
      shareId: data.shareId,
      projectId: context.projectId,
      organizationId: context.organizationId,
    });
    return { ok: true };
  });

export const getProjectReportDigestSettings = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(reportProjectInputSchema)
  .handler(({ context }) =>
    getReportDigestSettings({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      userEmail: context.userEmail,
      env,
    }),
  );

export const saveProjectReportDigestSettings = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(saveReportDigestInputSchema)
  .handler(({ data, context }) =>
    saveReportDigestSettings({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      userEmail: context.userEmail,
      enabled: data.enabled,
      windowDays: data.windowDays,
      env,
    }),
  );
