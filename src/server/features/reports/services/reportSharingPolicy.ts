import { getAuthMode } from "@/lib/auth-mode";
import { getEnvValueSync } from "@/server/lib/runtime-env";

export type ReportRuntimeEnv = {
  AUTH_MODE?: string;
  REPORT_PUBLIC_SHARE_MODE?: string;
  REPORT_PUBLIC_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
  LOOPS_API_KEY?: string;
  LOOPS_TRANSACTIONAL_REPORT_DIGEST_ID?: string;
};

export function getReportSharingPolicy(env: ReportRuntimeEnv) {
  const authMode = getAuthMode(getEnvValueSync(env, "AUTH_MODE"));
  const declaredMode = getEnvValueSync(env, "REPORT_PUBLIC_SHARE_MODE");

  if (authMode === "local_noauth" && declaredMode !== "share_only") {
    return {
      enabled: false,
      reason:
        "Public sharing is off in local no-auth mode. Expose only /share/* through a protected share-only origin, then set REPORT_PUBLIC_SHARE_MODE=share_only.",
    } as const;
  }

  return { enabled: true, reason: null } as const;
}

export function getReportPublicOrigin(env: ReportRuntimeEnv) {
  const candidate =
    getEnvValueSync(env, "REPORT_PUBLIC_ORIGIN") ??
    getEnvValueSync(env, "BETTER_AUTH_URL");
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.hostname === "localhost"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function isReportDigestDeliveryConfigured(env: ReportRuntimeEnv) {
  return Boolean(
    getEnvValueSync(env, "LOOPS_API_KEY") &&
    getEnvValueSync(env, "LOOPS_TRANSACTIONAL_REPORT_DIGEST_ID") &&
    getReportPublicOrigin(env),
  );
}
