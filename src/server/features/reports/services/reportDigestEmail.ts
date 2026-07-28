import { sendLoopsTransactionalEmail } from "@/server/email/loops";
import { getEnvValueSync } from "@/server/lib/runtime-env";
import type { PublicReport } from "@/types/schemas/reports";
import type { ReportRuntimeEnv } from "./reportSharingPolicy";

export async function sendReportDigestEmail(input: {
  env: ReportRuntimeEnv;
  email: string;
  report: PublicReport;
  reportUrl: string;
}) {
  const apiKey = getEnvValueSync(input.env, "LOOPS_API_KEY");
  const transactionalId = getEnvValueSync(
    input.env,
    "LOOPS_TRANSACTIONAL_REPORT_DIGEST_ID",
  );
  if (!apiKey || !transactionalId) {
    throw new Error("Report digest email is not configured");
  }

  await sendLoopsTransactionalEmail({
    apiKey,
    email: input.email,
    transactionalId,
    redactErrorDetails: true,
    dataVariables: {
      projectName: input.report.project.name,
      projectDomain: input.report.project.domain ?? "",
      reportPeriod: `${input.report.windowDays} days`,
      visibility: formatPercent(input.report.visibility.visibilityPct),
      visibilityChange:
        input.report.visibility.deltaPctPoints == null
          ? "Not available"
          : `${signed(input.report.visibility.deltaPctPoints)} pp`,
      answerCoverage: formatPercent(input.report.visibility.coveragePct),
      citationsPerAnswer: formatNumber(
        input.report.citations.avgCitationsPerAnswer,
      ),
      citedAnswerRate: formatPercent(input.report.citations.citedAnswerPct),
      reportUrl: input.reportUrl,
    },
  });
}

function formatPercent(value: number | null) {
  return value == null ? "Not available" : `${formatNumber(value)}%`;
}

function formatNumber(value: number | null) {
  return value == null
    ? "Not available"
    : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}
