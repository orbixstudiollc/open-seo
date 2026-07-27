import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  ShareOfVoiceCard,
  VisibilityBreakdownCard,
} from "@/client/features/ai-visibility/VisibilityBreakdowns";
import { VisibilityTrendCard } from "@/client/features/ai-visibility/VisibilityTrendCard";
import { getVisibilityOverview } from "@/serverFunctions/ai-visibility-analytics";
import type {
  VisibilityOverview,
  VisibilityWindow,
} from "@/types/schemas/ai-visibility-analytics";
import { formatVisibilityModel } from "./modelLabels";

const WINDOWS: VisibilityWindow[] = [7, 30, 90];

type Props = {
  projectId: string;
  windowDays: VisibilityWindow;
  onWindowChange: (window: VisibilityWindow) => void;
};

export function VisibilityOverviewPage({
  projectId,
  windowDays,
  onWindowChange,
}: Props) {
  const query = useQuery({
    queryKey: ["ai-visibility-overview", projectId, windowDays],
    queryFn: () => getVisibilityOverview({ data: { projectId, windowDays } }),
    staleTime: 60_000,
  });

  if (query.isPending) {
    return (
      <VisibilityOverviewLoading
        windowDays={windowDays}
        onWindowChange={onWindowChange}
      />
    );
  }

  if (query.isError) {
    return (
      <PageFrame
        header={
          <OverviewHeader windowDays={windowDays} onChange={onWindowChange} />
        }
      >
        <div
          role="alert"
          className="ai-visibility-card flex items-start gap-3 border-red-500/30 px-5 py-4 text-sm text-red-700 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {getStandardErrorMessage(
            query.error,
            "Couldn't load stored visibility history.",
          )}
        </div>
      </PageFrame>
    );
  }

  const overview = query.data;
  return (
    <PageFrame
      header={
        <OverviewHeader windowDays={windowDays} onChange={onWindowChange} />
      }
    >
      <HeadlineSection overview={overview} />
      <VisibilityTrendCard overview={overview} />
      <div className="grid gap-4 lg:grid-cols-2">
        <VisibilityBreakdownCard
          title="By platform"
          description="Only successful answers contribute to visibility."
          rows={overview.platforms}
        />
        <VisibilityBreakdownCard
          title="By topic"
          description="Current prompt topics, including uncategorized history."
          rows={overview.topics}
        />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <VisibilityBreakdownCard
          title="By prompt"
          description="Answer-level visibility for every tracked prompt."
          rows={overview.prompts}
        />
        <ShareOfVoiceCard
          shareOfVoice={overview.shareOfVoice}
          primaryBrandName={overview.primaryBrand?.name ?? null}
        />
      </div>
    </PageFrame>
  );
}

function PageFrame({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="ai-visibility-page min-h-full overflow-auto px-4 py-6 pb-24 sm:px-6 lg:py-8">
      <main className="mx-auto max-w-[1200px] space-y-4">
        {header}
        {children}
      </main>
    </div>
  );
}

function OverviewHeader({
  windowDays,
  onChange,
}: {
  windowDays: VisibilityWindow;
  onChange: (window: VisibilityWindow) => void;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 pb-2 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
          Tracked answers
        </p>
        <h1 className="ai-visibility-display mt-2 text-[30px] leading-tight sm:text-4xl">
          AI Visibility
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--visibility-body)]">
          How often your brand appears across stored prompt answers, with
          coverage-aware movement.
        </p>
      </div>
      <div
        role="group"
        aria-label="Visibility period"
        className="inline-flex self-start rounded-lg border border-[var(--visibility-hairline-strong)] bg-[var(--visibility-surface)] p-1 sm:self-auto"
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
            onClick={() => onChange(days)}
          >
            {days}d
          </button>
        ))}
      </div>
    </header>
  );
}

function HeadlineSection({ overview }: { overview: VisibilityOverview }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
      <section className="ai-visibility-card p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
          Visibility
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
          <p className="ai-visibility-display text-5xl leading-none tabular-nums sm:text-6xl">
            {overview.metric.visibilityPct == null
              ? "—"
              : formatPercent(overview.metric.visibilityPct)}
          </p>
          <DeltaLabel overview={overview} />
        </div>
        <p className="mt-5 text-sm text-[var(--visibility-body)]">
          {overview.primaryBrand ? (
            <>
              <strong className="font-semibold text-[var(--visibility-ink)]">
                {overview.metric.mentionedAnswers}
              </strong>{" "}
              of {overview.metric.successfulAnswers} successful answers mention{" "}
              <strong className="font-semibold text-[var(--visibility-ink)]">
                {overview.primaryBrand.name}
              </strong>
              .
            </>
          ) : (
            "Set a primary brand in the registry to calculate visibility."
          )}
        </p>
      </section>

      <section className="ai-visibility-card p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
          Answer coverage
        </p>
        <p className="ai-visibility-display mt-3 text-4xl tabular-nums">
          {overview.metric.coveragePct == null
            ? "—"
            : formatPercent(overview.metric.coveragePct)}
        </p>
        <p className="mt-3 text-sm text-[var(--visibility-body)]">
          {overview.metric.successfulAnswers} successful of{" "}
          {overview.metric.expectedAnswers} expected
        </p>
        <div className="mt-4 border-t border-[var(--visibility-hairline)] pt-3 text-xs text-[var(--visibility-muted)]">
          <p>
            {overview.metric.failedAnswers} failed ·{" "}
            {overview.successfulModels.length} successful{" "}
            {overview.successfulModels.length === 1 ? "platform" : "platforms"}
          </p>
          <p className="mt-1 truncate">
            {overview.successfulModels.length > 0
              ? overview.successfulModels.map(formatVisibilityModel).join(", ")
              : "No successful platform cohort"}
          </p>
        </div>
      </section>
    </div>
  );
}

function DeltaLabel({ overview }: { overview: VisibilityOverview }) {
  const delta = overview.comparison.deltaPctPoints;
  if (delta == null) {
    return (
      <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--visibility-canvas-soft)] px-3 py-1.5 text-xs font-medium text-[var(--visibility-muted)]">
        <Minus className="size-3.5" />
        Insufficient history
      </span>
    );
  }
  const positive = delta > 0;
  const Icon = positive ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={`mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
        positive
          ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
          : delta < 0
            ? "bg-red-600/10 text-red-700 dark:text-red-300"
            : "bg-[var(--visibility-canvas-soft)] text-[var(--visibility-muted)]"
      }`}
    >
      <Icon className="size-3.5" />
      {delta > 0 ? "+" : ""}
      {delta.toLocaleString(undefined, { maximumFractionDigits: 1 })} pp vs
      previous
    </span>
  );
}

function VisibilityOverviewLoading({
  windowDays,
  onWindowChange,
}: {
  windowDays: VisibilityWindow;
  onWindowChange: (window: VisibilityWindow) => void;
}) {
  return (
    <PageFrame
      header={
        <OverviewHeader windowDays={windowDays} onChange={onWindowChange} />
      }
    >
      <div className="grid gap-4 lg:grid-cols-2" aria-busy>
        <div className="ai-visibility-card h-48 animate-pulse bg-[var(--visibility-surface)]" />
        <div className="ai-visibility-card h-48 animate-pulse bg-[var(--visibility-surface)]" />
      </div>
      <div className="ai-visibility-card h-80 animate-pulse bg-[var(--visibility-surface)]" />
    </PageFrame>
  );
}

function formatPercent(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
