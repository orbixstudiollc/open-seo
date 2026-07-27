import type {
  VisibilityBreakdown,
  VisibilityOverview,
} from "@/types/schemas/ai-visibility-analytics";
import { formatVisibilityModel } from "./modelLabels";

export function VisibilityBreakdownCard({
  title,
  description,
  rows,
  limit,
}: {
  title: string;
  description: string;
  rows: VisibilityBreakdown[];
  limit?: number;
}) {
  const visibleRows = limit ? rows.slice(0, limit) : rows;
  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="border-b border-[var(--visibility-hairline)] px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-[13px] text-[var(--visibility-muted)]">
          {description}
        </p>
      </div>
      {visibleRows.length > 0 ? (
        <ul className="divide-y divide-[var(--visibility-hairline)]">
          {visibleRows.map((row) => (
            <BreakdownRow key={row.key} row={row} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-[var(--visibility-muted)]">
          No stored answers in this period.
        </p>
      )}
    </section>
  );
}

function BreakdownRow({ row }: { row: VisibilityBreakdown }) {
  const pct = row.metric.visibilityPct;
  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={row.label}>
            {row.label}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--visibility-muted)]">
            {row.detail ? `${row.detail} · ` : ""}
            {row.metric.mentionedAnswers} of {row.metric.successfulAnswers}{" "}
            successful
            {row.metric.failedAnswers > 0
              ? ` · ${row.metric.failedAnswers} failed`
              : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {pct == null ? "—" : formatPercent(pct)}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--visibility-hairline)]">
        <div
          className="h-full rounded-full bg-[var(--visibility-ink)] opacity-70"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </li>
  );
}

export function ShareOfVoiceCard({
  shareOfVoice,
  primaryBrandName,
}: {
  shareOfVoice: VisibilityOverview["shareOfVoice"];
  primaryBrandName: string | null;
}) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="border-b border-[var(--visibility-hairline)] px-5 py-4">
        <h2 className="text-base font-semibold">Share of Voice</h2>
        <p className="mt-0.5 text-[13px] text-[var(--visibility-muted)]">
          Mention volume among registered brands—not answer visibility.
        </p>
      </div>
      {shareOfVoice ? (
        <>
          <ul className="divide-y divide-[var(--visibility-hairline)]">
            {shareOfVoice.entries.map((entry) => (
              <li key={entry.brandId} className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {entry.label}
                  </span>
                  {entry.isTarget ? (
                    <span className="rounded-full bg-[var(--visibility-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                      You
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs tabular-nums text-[var(--visibility-muted)]">
                    {entry.mentions} mentions
                  </span>
                  <span className="w-12 text-right text-sm font-semibold tabular-nums">
                    {entry.sharePct == null
                      ? "—"
                      : formatPercent(entry.sharePct)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--visibility-hairline)]">
                  <div
                    className={
                      entry.isTarget
                        ? "h-full rounded-full bg-[var(--visibility-accent)]"
                        : "h-full rounded-full bg-[var(--visibility-ink)] opacity-30"
                    }
                    style={{ width: `${entry.sharePct ?? 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--visibility-hairline)] px-5 py-3 text-[11px] text-[var(--visibility-muted)]">
            Successful answers from{" "}
            {shareOfVoice.platforms.map(formatVisibilityModel).join(", ")} only.
          </p>
        </>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium">No competitor comparison yet</p>
          <p className="mt-1 text-xs text-[var(--visibility-muted)]">
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
