/* eslint-disable max-lines -- the report preview and its delivery controls are one route-owned surface. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Copy,
  Download,
  Link2,
  Mail,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  createProjectReportShare,
  getProjectReport,
  getProjectReportDigestSettings,
  getReportShareState,
  revokeProjectReportShare,
  saveProjectReportDigestSettings,
} from "@/serverFunctions/reports";
import {
  reportShareExpiryDaysSchema,
  type PublicReport,
  type ReportDigestSettings,
  type ReportShareSummary,
} from "@/types/schemas/reports";
import {
  visibilityWindowSchema,
  type VisibilityWindow,
} from "@/types/schemas/ai-visibility-analytics";

const WINDOWS: VisibilityWindow[] = [7, 30, 90];

export function ReportsPage({
  projectId,
  windowDays,
  onWindowChange,
}: {
  projectId: string;
  windowDays: VisibilityWindow;
  onWindowChange: (window: VisibilityWindow) => void;
}) {
  const report = useQuery({
    queryKey: ["project-report", projectId, windowDays],
    queryFn: () => getProjectReport({ data: { projectId, windowDays } }),
    staleTime: 60_000,
  });

  return (
    <div className="ai-visibility-page min-h-full overflow-auto px-4 py-6 pb-24 sm:px-6 lg:py-8">
      <main className="mx-auto max-w-[1200px] space-y-4">
        <ReportHeader
          projectId={projectId}
          windowDays={windowDays}
          onWindowChange={onWindowChange}
        />
        {report.isPending ? (
          <ReportLoading />
        ) : report.isError ? (
          <ReportError error={report.error} />
        ) : (
          <>
            <ReportPreview report={report.data} />
            <DeliveryControls projectId={projectId} windowDays={windowDays} />
          </>
        )}
      </main>
    </div>
  );
}

function ReportHeader({
  projectId,
  windowDays,
  onWindowChange,
}: {
  projectId: string;
  windowDays: VisibilityWindow;
  onWindowChange: (window: VisibilityWindow) => void;
}) {
  const exportUrl = `/api/reports/export?projectId=${encodeURIComponent(projectId)}&days=${windowDays}`;
  return (
    <header className="flex flex-col justify-between gap-5 pb-2 lg:flex-row lg:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
          Client delivery
        </p>
        <h1 className="ai-visibility-display mt-2 text-[30px] leading-tight sm:text-4xl">
          Reports
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--visibility-body)]">
          Package stored AI visibility and citation intelligence into a
          read-only report.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Report period"
          className="inline-flex rounded-lg border border-[var(--visibility-hairline-strong)] bg-[var(--visibility-surface)] p-1"
        >
          {WINDOWS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={windowDays === days}
              className={`h-10 min-w-14 rounded-md px-3 text-sm font-medium transition-colors ${
                windowDays === days
                  ? "bg-[var(--visibility-accent)] text-white"
                  : "text-[var(--visibility-body)] hover:bg-[var(--visibility-canvas-soft)]"
              }`}
              onClick={() => onWindowChange(days)}
            >
              {days}d
            </button>
          ))}
        </div>
        <a
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--visibility-ink)] px-4 text-sm font-medium text-[var(--visibility-canvas)]"
          href={exportUrl}
        >
          <Download className="size-4" />
          Export PDF
        </a>
      </div>
    </header>
  );
}

function ReportPreview({ report }: { report: PublicReport }) {
  return (
    <>
      <section className="ai-visibility-card overflow-hidden">
        <div className="border-b border-[var(--visibility-hairline)] px-5 py-5 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
            {report.windowDays}-day report
          </p>
          <h2 className="ai-visibility-display mt-2 text-2xl">
            {report.project.name}
          </h2>
          <p className="mt-1 text-sm text-[var(--visibility-muted)]">
            {report.project.domain ?? "Project report"} ·{" "}
            {formatDate(report.period.currentStart)} to{" "}
            {formatDate(report.period.currentEnd)}
          </p>
        </div>
        <div className="grid gap-px bg-[var(--visibility-hairline)] sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Visibility"
            value={formatPercent(report.visibility.visibilityPct)}
            detail={`${report.visibility.mentionedAnswers} of ${report.visibility.successfulAnswers} successful answers`}
          />
          <Metric
            label="Answer coverage"
            value={formatPercent(report.visibility.coveragePct)}
            detail={`${report.visibility.successfulAnswers} of ${report.visibility.expectedAnswers} expected`}
          />
          <Metric
            label="Citations / answer"
            value={formatNumber(report.citations.avgCitationsPerAnswer)}
            detail={`${report.citations.citations.toLocaleString()} sanitized citations`}
          />
          <Metric
            label="Cited-answer rate"
            value={formatPercent(report.citations.citedAnswerPct)}
            detail={`${report.citations.uniqueDomains.toLocaleString()} unique domains`}
          />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ReportTable
          title="Visibility by platform"
          columns={["Platform", "Visibility", "Answers"]}
          rows={report.visibility.platforms.map((row) => [
            row.label,
            formatPercent(row.visibilityPct),
            row.successfulAnswers.toLocaleString(),
          ])}
          empty="No successful platform observations in this period."
        />
        <ReportTable
          title="Top cited domains"
          columns={["Domain", "Type", "Citations"]}
          rows={report.citations.topDomains.map((row) => [
            row.domain,
            titleCase(row.domainType),
            row.citations.toLocaleString(),
          ])}
          empty="No safe cited domains in this period."
        />
      </div>

      <ReportTable
        title="Competitor-source gaps"
        columns={["Domain", "Tracked competitors", "Answers", "Citations"]}
        rows={report.citations.competitorSourceGaps.map((row) => [
          row.domain,
          row.competitorNames.join(", "),
          row.competitorMentionedAnswers.toLocaleString(),
          row.citationsInCompetitorAnswers.toLocaleString(),
        ])}
        empty="No competitor-source gaps in this period."
      />
    </>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-[var(--visibility-surface)] px-5 py-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
        {label}
      </p>
      <p className="ai-visibility-display mt-2 text-3xl tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-[var(--visibility-muted)]">{detail}</p>
    </div>
  );
}

function ReportTable({
  title,
  columns,
  rows,
  empty,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="border-b border-[var(--visibility-hairline)] px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-[var(--visibility-canvas-soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-5 py-3 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--visibility-hairline)]">
              {rows.map((row, rowIndex) => (
                <tr key={`${row[0]}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${cellIndex}-${cell}`}
                      className={`px-5 py-3 ${
                        cellIndex > 1 ? "tabular-nums" : ""
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-sm text-[var(--visibility-muted)]">
          {empty}
        </p>
      )}
    </section>
  );
}

function DeliveryControls({
  projectId,
  windowDays,
}: {
  projectId: string;
  windowDays: VisibilityWindow;
}) {
  const shares = useQuery({
    queryKey: ["report-shares", projectId],
    queryFn: () => getReportShareState({ data: { projectId } }),
  });
  const digest = useQuery({
    queryKey: ["report-digest", projectId],
    queryFn: () => getProjectReportDigestSettings({ data: { projectId } }),
  });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <ShareControls
        projectId={projectId}
        windowDays={windowDays}
        state={shares.data}
        loading={shares.isPending}
      />
      <DigestControls
        projectId={projectId}
        settings={digest.data}
        loading={digest.isPending}
      />
    </div>
  );
}

function ShareControls({
  projectId,
  windowDays,
  state,
  loading,
}: {
  projectId: string;
  windowDays: VisibilityWindow;
  state:
    | {
        sharingEnabled: boolean;
        sharingDisabledReason: string | null;
        shares: ReportShareSummary[];
      }
    | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30>(7);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      createProjectReportShare({
        data: { projectId, windowDays, expiresInDays },
      }),
    onSuccess: async (result) => {
      setCreatedUrl(result.url);
      await queryClient.invalidateQueries({
        queryKey: ["report-shares", projectId],
      });
      try {
        await navigator.clipboard.writeText(result.url);
        toast.success("Share link created and copied");
      } catch {
        toast.success("Share link created");
      }
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Could not create a share link"),
      ),
  });
  const revoke = useMutation({
    mutationFn: (shareId: string) =>
      revokeProjectReportShare({ data: { projectId, shareId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["report-shares", projectId],
      });
      toast.success("Share link revoked");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not revoke the link")),
  });

  return (
    <section className="ai-visibility-card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-[var(--visibility-accent)]" />
        <h2 className="text-base font-semibold">Expiring share links</h2>
      </div>
      <p className="mt-2 text-sm text-[var(--visibility-muted)]">
        Anyone with an active link can read this project's fixed-period report.
      </p>
      {loading ? (
        <div className="mt-5 h-20 animate-pulse rounded-lg bg-[var(--visibility-canvas-soft)]" />
      ) : !state?.sharingEnabled ? (
        <div className="mt-5 flex gap-3 rounded-lg border border-[var(--visibility-hairline)] bg-[var(--visibility-canvas-soft)] p-4 text-sm text-[var(--visibility-body)]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--visibility-accent)]" />
          <p>{state?.sharingDisabledReason}</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <label className="flex-1 text-xs font-medium text-[var(--visibility-muted)]">
              Expires after
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[var(--visibility-hairline-strong)] bg-[var(--visibility-surface)] px-3 text-[var(--visibility-ink)]"
                value={expiresInDays}
                onChange={(event) => {
                  const parsed = reportShareExpiryDaysSchema.safeParse(
                    Number(event.target.value),
                  );
                  if (parsed.success) setExpiresInDays(parsed.data);
                }}
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
            <button
              type="button"
              className="mt-auto h-10 rounded-lg bg-[var(--visibility-accent)] px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              Create link
            </button>
          </div>
          {createdUrl ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--visibility-hairline)] bg-[var(--visibility-canvas-soft)] p-2">
              <input
                aria-label="New share URL"
                readOnly
                value={createdUrl}
                className="min-w-0 flex-1 bg-transparent px-2 text-sm"
              />
              <button
                type="button"
                aria-label="Copy share URL"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--visibility-hairline-strong)] bg-[var(--visibility-surface)]"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(createdUrl)
                    .then(() => toast.success("Share link copied"))
                    .catch(() => toast.error("Clipboard unavailable"));
                }}
              >
                <Copy className="size-4" />
              </button>
            </div>
          ) : null}
          <ShareList
            shares={state.shares}
            onRevoke={(shareId) => revoke.mutate(shareId)}
            revoking={revoke.isPending}
          />
        </>
      )}
    </section>
  );
}

function ShareList({
  shares,
  onRevoke,
  revoking,
}: {
  shares: ReportShareSummary[];
  onRevoke: (shareId: string) => void;
  revoking: boolean;
}) {
  const visible = shares
    .filter((share) => share.purpose === "manual")
    .slice(0, 5);
  if (visible.length === 0) {
    return (
      <p className="mt-5 text-sm text-[var(--visibility-muted)]">
        No manual links have been created.
      </p>
    );
  }
  return (
    <ul className="mt-5 divide-y divide-[var(--visibility-hairline)] border-t border-[var(--visibility-hairline)]">
      {visible.map((share) => (
        <li key={share.id} className="flex items-center gap-3 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {share.windowDays}-day report · {titleCase(share.status)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--visibility-muted)]">
              Expires {formatDateTime(share.expiresAt)}
            </p>
          </div>
          {share.status === "active" ? (
            <button
              type="button"
              aria-label="Revoke share link"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--visibility-negative)] hover:bg-[var(--visibility-negative-soft)]"
              disabled={revoking}
              onClick={() => onRevoke(share.id)}
            >
              <XCircle className="size-4" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DigestControls({
  projectId,
  settings,
  loading,
}: {
  projectId: string;
  settings: ReportDigestSettings | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [windowDays, setWindowDays] = useState<VisibilityWindow>(30);
  useEffect(() => {
    if (settings) setWindowDays(settings.windowDays);
  }, [settings]);
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      saveProjectReportDigestSettings({
        data: { projectId, enabled, windowDays },
      }),
    onSuccess: async (_, enabled) => {
      await queryClient.invalidateQueries({
        queryKey: ["report-digest", projectId],
      });
      toast.success(
        enabled ? "Weekly digest enabled" : "Weekly digest disabled",
      );
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Could not update the digest"),
      ),
  });

  return (
    <section className="ai-visibility-card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-[var(--visibility-accent)]" />
        <h2 className="text-base font-semibold">Weekly email digest</h2>
      </div>
      <p className="mt-2 text-sm text-[var(--visibility-muted)]">
        Send a stored-data summary and a seven-day report link to your account
        email.
      </p>
      {loading ? (
        <div className="mt-5 h-20 animate-pulse rounded-lg bg-[var(--visibility-canvas-soft)]" />
      ) : settings ? (
        <>
          <div className="mt-5 rounded-lg border border-[var(--visibility-hairline)] bg-[var(--visibility-canvas-soft)] p-4 text-sm">
            <p className="font-medium">{settings.recipientEmail}</p>
            <p className="mt-1 text-xs text-[var(--visibility-muted)]">
              {settings.enabled && settings.nextSendAt
                ? `Next send ${formatDateTime(settings.nextSendAt)}`
                : "Digest is disabled"}
            </p>
          </div>
          {!settings.deliveryConfigured || !settings.sharingEnabled ? (
            <div className="mt-3 flex gap-3 text-sm text-[var(--visibility-body)]">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--visibility-accent)]" />
              <p>
                {settings.sharingDisabledReason ??
                  "Digest email delivery is not configured for this deployment."}
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="flex-1 text-xs font-medium text-[var(--visibility-muted)]">
                Report period
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--visibility-hairline-strong)] bg-[var(--visibility-surface)] px-3 text-[var(--visibility-ink)]"
                  value={windowDays}
                  onChange={(event) => {
                    const parsed = visibilityWindowSchema.safeParse(
                      Number(event.target.value),
                    );
                    if (parsed.success) setWindowDays(parsed.data);
                  }}
                >
                  {WINDOWS.map((days) => (
                    <option key={days} value={days}>
                      {days} days
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  className="h-10 rounded-lg bg-[var(--visibility-accent)] px-4 text-sm font-medium text-white disabled:opacity-50"
                  disabled={save.isPending}
                  onClick={() => save.mutate(true)}
                >
                  {settings.enabled ? "Save digest" : "Enable digest"}
                </button>
                {settings.enabled ? (
                  <button
                    type="button"
                    className="h-10 rounded-lg border border-[var(--visibility-hairline-strong)] bg-[var(--visibility-surface)] px-4 text-sm font-medium disabled:opacity-50"
                    disabled={save.isPending}
                    onClick={() => save.mutate(false)}
                  >
                    Disable
                  </button>
                ) : null}
              </div>
            </div>
          )}
          {settings.lastSentAt ? (
            <p className="mt-4 text-xs text-[var(--visibility-muted)]">
              Last sent {formatDateTime(settings.lastSentAt)}
              {settings.lastError ? " · Latest delivery failed" : ""}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ReportLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="ai-visibility-card h-56 animate-pulse bg-[var(--visibility-surface)]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="ai-visibility-card h-72 animate-pulse bg-[var(--visibility-surface)]" />
        <div className="ai-visibility-card h-72 animate-pulse bg-[var(--visibility-surface)]" />
      </div>
    </div>
  );
}

function ReportError({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="ai-visibility-card flex items-start gap-3 border-[var(--visibility-negative)]/30 px-5 py-4 text-sm text-[var(--visibility-negative)]"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {getStandardErrorMessage(error, "Could not load the stored report.")}
    </div>
  );
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${formatNumber(value)}%`;
}

function formatNumber(value: number | null) {
  return value == null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
