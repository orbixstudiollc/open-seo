import { useMemo } from "react";
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
import type { CitationIntelligenceOverview } from "@/types/schemas/citation-intelligence";

type ChartPoint = {
  date: string;
  avgCitationsPerAnswer: number | null;
  citations: number | null;
  successfulAnswers: number | null;
};

export function CitationDensityTrendCard({
  overview,
}: {
  overview: CitationIntelligenceOverview;
}) {
  const chartData = useMemo(() => addNullGapPoints(overview), [overview]);

  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--app-hairline)] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Citation density trend</h2>
          <p className="mt-0.5 text-[13px] text-[var(--app-muted)]">
            Daily citations per successful stored answer.
          </p>
        </div>
        <span className="rounded-full bg-[var(--app-canvas-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
          {overview.metric.successfulAnswers} observations
        </span>
      </div>

      {overview.trend.length > 0 ? (
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
                  domain={[0, "auto"]}
                  allowDecimals
                  width={44}
                  tick={{
                    fontSize: 11,
                    fill: "var(--app-muted)",
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<DensityTooltip />} />
                <Line
                  type="linear"
                  dataKey="avgCitationsPerAnswer"
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
            Missing dates remain gaps; successful answers with no citations
            render as an observed zero.
          </p>
        </div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
          <p className="text-base font-medium">No citation observations yet</p>
          <p className="mt-2 max-w-md text-sm text-[var(--app-muted)]">
            The trend begins when a tracked run stores its first successful
            answer.
          </p>
        </div>
      )}
    </section>
  );
}

function addNullGapPoints(
  overview: CitationIntelligenceOverview,
): ChartPoint[] {
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
      avgCitationsPerAnswer: point?.avgCitationsPerAnswer ?? null,
      citations: point?.citations ?? null,
      successfulAnswers: point?.successfulAnswers ?? null,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

function DensityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.avgCitationsPerAnswer == null) return null;
  return (
    <div className="rounded-lg border border-[var(--app-hairline-strong)] bg-[var(--app-surface)] px-3 py-2 text-xs text-[var(--app-body)]">
      <p>{formatLongDate(point.date)}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--app-ink)]">
        {formatNumber(point.avgCitationsPerAnswer)} citations / answer
      </p>
      <p className="mt-0.5">
        {point.citations} citations · {point.successfulAnswers} successful
        answers
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

function axisInterval(days: number): number {
  if (days <= 7) return 0;
  if (days <= 30) return 5;
  return 14;
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
