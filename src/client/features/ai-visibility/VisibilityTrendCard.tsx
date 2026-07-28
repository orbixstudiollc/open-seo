import { useMemo } from "react";
import { visibilityDeltaHeading } from "@/shared/aiVisibilityLabels";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import type { VisibilityOverview } from "@/types/schemas/ai-visibility-analytics";

type Props = {
  overview: VisibilityOverview;
};

type ChartPoint = {
  date: string;
  visibilityPct: number | null;
  successfulAnswers: number | null;
  mentionedAnswers: number | null;
};

export function VisibilityTrendCard({ overview }: Props) {
  const chartData = useMemo(() => addNullGapPoints(overview), [overview]);
  const hasObservations = overview.trend.length > 0;

  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--app-hairline)] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Visibility trend</h2>
          <p className="mt-0.5 text-[13px] text-[var(--app-muted)]">
            Daily share of successful answers that mention{" "}
            {overview.primaryBrand?.name ?? "your primary brand"}.
          </p>
        </div>
        <span className="rounded-full bg-[var(--app-canvas-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
          {overview.metric.successfulAnswers} observations
        </span>
      </div>

      {hasObservations ? (
        <div className="px-2 pb-2 pt-5 sm:px-4">
          <div className="h-64">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={{ width: 640, height: 256 }}
            >
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 24, bottom: 4, left: 0 }}
              >
                <CartesianGrid vertical={false} stroke="var(--app-hairline)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatAxisDate}
                  interval={axisInterval(overview.windowDays)}
                  tick={{
                    fontSize: 11,
                    fill: "var(--app-muted)",
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(value: number) => `${value}%`}
                  tick={{
                    fontSize: 11,
                    fill: "var(--app-muted)",
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<TrendTooltip />} />
                <Line
                  type="linear"
                  dataKey="visibilityPct"
                  stroke="var(--app-ink)"
                  strokeWidth={2}
                  dot={{
                    r: 2.5,
                    fill: "var(--app-surface)",
                    stroke: "var(--app-ink)",
                    strokeWidth: 2,
                  }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="flex items-center gap-1.5 px-2 pb-2 text-[11px] text-[var(--app-muted)]">
            <Info className="size-3.5 shrink-0" />
            Missing dates remain gaps; successful zero-mention dates render at
            0%.
          </p>
        </div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
          <p className="text-base font-medium">No trend observations yet</p>
          <p className="mt-2 max-w-md text-sm text-[var(--app-muted)]">
            The chart will begin with the first successful stored prompt answer.
            Missing and failed runs are not drawn as zero.
          </p>
        </div>
      )}

      {overview.comparison.status !== "available" ? (
        <div className="flex items-start gap-2 border-t border-[var(--app-hairline)] bg-[var(--app-canvas-soft)] px-5 py-3 text-[13px] text-[var(--app-body)]">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--app-ink)]" />
          <span>
            <strong className="font-semibold text-[var(--app-ink)]">
              {visibilityDeltaHeading(overview.comparison.status)?.heading ??
                "Comparison unavailable."}
            </strong>{" "}
            {overview.comparison.message}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function addNullGapPoints(overview: VisibilityOverview): ChartPoint[] {
  const observed = new Map(overview.trend.map((point) => [point.date, point]));
  const points: ChartPoint[] = [];
  const cursor = new Date(overview.period.currentStart);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(overview.period.currentEnd);
  while (cursor.getTime() < end.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    const point = observed.get(date);
    points.push({
      date,
      visibilityPct: point?.visibilityPct ?? null,
      successfulAnswers: point?.successfulAnswers ?? null,
      mentionedAnswers: point?.mentionedAnswers ?? null,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.visibilityPct == null) return null;
  return (
    <div className="rounded-lg border border-[var(--app-hairline-strong)] bg-[var(--app-surface)] px-3 py-2 text-xs text-[var(--app-body)]">
      <p>{formatLongDate(point.date)}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--app-ink)]">
        {formatPercent(point.visibilityPct)} visibility
      </p>
      <p className="mt-0.5">
        {point.mentionedAnswers} of {point.successfulAnswers} answers
      </p>
    </div>
  );
}

function formatAxisDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatPercent(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function axisInterval(days: number): number {
  if (days <= 7) return 0;
  if (days <= 30) return 5;
  return 14;
}
