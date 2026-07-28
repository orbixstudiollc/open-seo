import { Link } from "@tanstack/react-router";
import type {
  VisibilityLeaderboardSort,
  VisibilityBreakdown,
  VisibilityOverview,
} from "@/types/schemas/ai-visibility-analytics";
import { formatAiModelLabel } from "@/shared/aiVisibilityLabels";
import { TrackedPromptRunButton } from "./TrackedPromptRunButton";

export function VisibilityBreakdownCard({
  title,
  description,
  rows,
  limit,
  projectId,
  promptActions = false,
}: {
  title: string;
  description: string;
  rows: VisibilityBreakdown[];
  limit?: number;
  projectId?: string;
  promptActions?: boolean;
}) {
  const visibleRows = limit ? rows.slice(0, limit) : rows;
  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="border-b border-[var(--app-hairline)] px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-[13px] text-[var(--app-muted)]">
          {description}
        </p>
      </div>
      {visibleRows.length > 0 ? (
        <ul className="divide-y divide-[var(--app-hairline)]">
          {visibleRows.map((row) => (
            <BreakdownRow
              key={row.key}
              row={row}
              projectId={projectId}
              promptActions={promptActions}
            />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-[var(--app-muted)]">
          No stored answers in this period.
        </p>
      )}
    </section>
  );
}

function BreakdownRow({
  row,
  projectId,
  promptActions,
}: {
  row: VisibilityBreakdown;
  projectId?: string;
  promptActions: boolean;
}) {
  const pct = row.metric.visibilityPct;
  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {promptActions && projectId ? (
            <Link
              to="/p/$projectId/visibility/answers"
              params={{ projectId }}
              search={{ promptId: row.trackedPromptId ?? row.key }}
              className="block truncate text-sm font-medium underline decoration-[var(--app-hairline-strong)] underline-offset-2"
              title={row.label}
            >
              {row.label}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium" title={row.label}>
              {row.label}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-[var(--app-muted)]">
            {row.detail ? `${row.detail} · ` : ""}
            {row.metric.mentionedAnswers} of {row.metric.successfulAnswers}{" "}
            successful
            {row.metric.failedAnswers > 0
              ? ` · ${row.metric.failedAnswers} failed`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {pct == null ? "—" : formatPercent(pct)}
          </span>
          {promptActions &&
          projectId &&
          row.promptSetId &&
          row.trackedPromptId ? (
            <TrackedPromptRunButton
              compact
              projectId={projectId}
              promptSetId={row.promptSetId}
              trackedPromptId={row.trackedPromptId}
              modelCount={0}
            />
          ) : null}
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--app-hairline)]">
        <div
          className="h-full rounded-full bg-[var(--app-ink)] opacity-70"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </li>
  );
}

export function ShareOfVoiceCard({
  shareOfVoice,
  primaryBrandName,
  onSortChange,
  projectId,
  windowDays,
}: {
  shareOfVoice: VisibilityOverview["shareOfVoice"];
  primaryBrandName: string | null;
  onSortChange: (sort: VisibilityLeaderboardSort) => void;
  projectId: string;
  windowDays: 7 | 30 | 90;
}) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--app-hairline)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Brand leaderboard</h2>
          <p className="mt-0.5 text-[13px] text-[var(--app-muted)]">
            Mention volume, estimated sentiment, and first-mention position.
          </p>
        </div>
        {shareOfVoice ? (
          <label className="flex items-center gap-2 text-xs text-[var(--app-muted)]">
            Sort by
            <select
              aria-label="Sort brand leaderboard"
              className="h-9 rounded-md border border-[var(--app-hairline-strong)] bg-[var(--app-surface)] px-2 text-xs font-medium text-[var(--app-ink)]"
              value={shareOfVoice.sortBy}
              onChange={(event) => {
                const sort = leaderboardSort(event.target.value);
                if (sort) onSortChange(sort);
              }}
            >
              <option value="mentions">Mentions</option>
              <option value="sentiment">Sentiment estimate</option>
              <option value="position">Average position</option>
            </select>
          </label>
        ) : null}
      </div>
      {shareOfVoice ? (
        <>
          <ul className="divide-y divide-[var(--app-hairline)]">
            {shareOfVoice.entries.map((entry) => (
              <li key={entry.brandId} className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Link
                    to="/p/$projectId/visibility/brands/$brandId"
                    params={{ projectId, brandId: entry.brandId }}
                    search={{
                      days: windowDays === 30 ? undefined : windowDays,
                    }}
                    className="min-w-0 truncate text-sm font-medium underline decoration-[var(--app-hairline-strong)] underline-offset-2"
                  >
                    {entry.label}
                  </Link>
                  {entry.isTarget ? (
                    <span className="rounded-full bg-[var(--app-ink)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--app-canvas)]">
                      You
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs tabular-nums text-[var(--app-muted)]">
                    {entry.mentions} mentions
                  </span>
                  <span className="w-12 text-right text-sm font-semibold tabular-nums">
                    {entry.sharePct == null
                      ? "—"
                      : formatPercent(entry.sharePct)}
                  </span>
                </div>
                <div className="mt-1.5 flex gap-3 text-[11px] tabular-nums text-[var(--app-muted)]">
                  <span>
                    Sentiment estimate{" "}
                    {entry.sentimentEstimate == null
                      ? "—"
                      : formatSentimentEstimate(entry.sentimentEstimate)}
                  </span>
                  <span>
                    Avg. position{" "}
                    {entry.averagePosition == null
                      ? "—"
                      : `#${entry.averagePosition.toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--app-hairline)]">
                  <div
                    className={
                      entry.isTarget
                        ? "h-full rounded-full bg-[var(--app-ink)]"
                        : "h-full rounded-full bg-[var(--app-ink)] opacity-30"
                    }
                    style={{ width: `${entry.sharePct ?? 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--app-hairline)] px-5 py-3 text-[11px] text-[var(--app-muted)]">
            Successful answers from{" "}
            {shareOfVoice.platforms.map(formatAiModelLabel).join(", ")} only.
          </p>
        </>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium">No competitor comparison yet</p>
          <p className="mt-1 text-xs text-[var(--app-muted)]">
            {primaryBrandName
              ? "Add another active brand to the registry to calculate Share of Voice."
              : "Set a primary brand and competitors to calculate Share of Voice."}
          </p>
        </div>
      )}
    </section>
  );
}

function formatPercent(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function formatSentimentEstimate(value: number): string {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return value > 0 ? `+${formatted}` : formatted;
}

function leaderboardSort(value: string): VisibilityLeaderboardSort | null {
  return value === "mentions" || value === "sentiment" || value === "position"
    ? value
    : null;
}
