import { withPgClient } from "@/db";
import { runScheduledAiTrackedRuns } from "@/server/features/ai-visibility/services/scheduledAiRuns";
import { runScheduledRankChecks } from "@/server/features/rank-tracking/services/scheduledRankChecks";
import { runScheduledReportDigests } from "@/server/features/reports/services/ReportDigestService";

type ScheduledDependencies = {
  withDatabaseScope: typeof withPgClient;
  rankChecks: typeof runScheduledRankChecks;
  aiTrackedRuns: typeof runScheduledAiTrackedRuns;
  reportDigests: typeof runScheduledReportDigests;
};

const defaultDependencies: ScheduledDependencies = {
  withDatabaseScope: withPgClient,
  rankChecks: runScheduledRankChecks,
  aiTrackedRuns: runScheduledAiTrackedRuns,
  reportDigests: runScheduledReportDigests,
};

export async function runScheduledDispatchers(
  env: Env,
  dependencies: ScheduledDependencies = defaultDependencies,
) {
  await dependencies.withDatabaseScope(async () => {
    try {
      await dependencies.rankChecks(env);
    } catch (error) {
      console.error("[cron] Rank tracking dispatcher failed:", error);
    }
    try {
      await dependencies.aiTrackedRuns(env);
    } catch (error) {
      console.error("[cron] AI tracked-run dispatcher failed:", error);
    }
    try {
      await dependencies.reportDigests(env);
    } catch (error) {
      console.error("[cron] Report digest dispatcher failed:", error);
    }
  });
}
