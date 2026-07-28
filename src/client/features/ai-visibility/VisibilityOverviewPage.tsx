import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  ShareOfVoiceCard,
  VisibilityBreakdownCard,
} from "@/client/features/ai-visibility/VisibilityBreakdowns";
import { VisibilityTrendCard } from "@/client/features/ai-visibility/VisibilityTrendCard";
import { AiPromptSuggestionQueue } from "@/client/features/ai-visibility/AiPromptSuggestionQueue";
import { AiVisibilitySetupWizard } from "@/client/features/ai-visibility/AiVisibilitySetupWizard";
import { getVisibilityOverview } from "@/serverFunctions/ai-visibility-analytics";
import { getAiVisibilitySetupState } from "@/serverFunctions/ai-visibility-setup";
import type {
  VisibilityLeaderboardSort,
  VisibilityOverview,
  VisibilityWindow,
} from "@/types/schemas/ai-visibility-analytics";
import {
  formatAiModelLabel,
  visibilityDeltaHeading,
} from "@/shared/aiVisibilityLabels";

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
  const queryClient = useQueryClient();
  const setupQuery = useQuery({
    queryKey: ["ai-visibility-setup", projectId],
    queryFn: () => getAiVisibilitySetupState({ data: { projectId } }),
  });

  if (setupQuery.isPending) {
    return (
      <VisibilityOverviewLoading
        windowDays={windowDays}
        onWindowChange={onWindowChange}
      />
    );
  }

  if (setupQuery.isError) {
    return (
      <PageFrame
        header={
          <OverviewHeader windowDays={windowDays} onChange={onWindowChange} />
        }
      >
        <div
          role="alert"
          className="ai-visibility-card flex items-start gap-3 border-[var(--app-negative)]/30 px-5 py-4 text-sm text-[var(--app-negative)]"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {getStandardErrorMessage(
            setupQuery.error,
            "Couldn't load AI visibility setup.",
          )}
        </div>
      </PageFrame>
    );
  }

  if (setupQuery.data.needsSetup) {
    return (
      <AiVisibilitySetupWizard
        projectId={projectId}
        setupState={setupQuery.data}
        onComplete={(state) =>
          queryClient.setQueryData(["ai-visibility-setup", projectId], state)
        }
      />
    );
  }

  return (
    <ConfiguredVisibilityOverview
      projectId={projectId}
      windowDays={windowDays}
      onWindowChange={onWindowChange}
      setupState={setupQuery.data}
      onSetupStateChange={async () => {
        await setupQuery.refetch();
      }}
    />
  );
}

function ConfiguredVisibilityOverview({
  projectId,
  windowDays,
  onWindowChange,
  setupState,
  onSetupStateChange,
}: Props & {
  setupState: Awaited<ReturnType<typeof getAiVisibilitySetupState>>;
  onSetupStateChange: () => Promise<void>;
}) {
  const [leaderboardSort, setLeaderboardSort] =
    useState<VisibilityLeaderboardSort>("mentions");
  const query = useQuery({
    queryKey: [
      "ai-visibility-overview",
      projectId,
      windowDays,
      leaderboardSort,
    ],
    queryFn: () =>
      getVisibilityOverview({
        data: { projectId, windowDays, leaderboardSort },
      }),
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
          className="ai-visibility-card flex items-start gap-3 border-[var(--app-negative)]/30 px-5 py-4 text-sm text-[var(--app-negative)]"
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
      <AiPromptSuggestionQueue
        projectId={projectId}
        setupState={setupState}
        onStateChange={onSetupStateChange}
      />
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
          onSortChange={setLeaderboardSort}
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Tracked answers
        </p>
        <h1 className="ai-visibility-display mt-2 text-[30px] leading-tight sm:text-4xl">
          AI Visibility
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--app-body)]">
          How often your brand appears across stored prompt answers, with
          coverage-aware movement.
        </p>
      </div>
      <div
        role="group"
        aria-label="Visibility period"
        className="inline-flex self-start rounded-lg border border-[var(--app-hairline-strong)] bg-[var(--app-surface)] p-1 sm:self-auto"
      >
        {WINDOWS.map((days) => (
          <button
            key={days}
            type="button"
            aria-pressed={windowDays === days}
            className={`h-10 min-w-14 rounded-md px-3 text-sm font-medium transition-colors ${
              windowDays === days
                ? "bg-[var(--app-ink)] text-[var(--app-canvas)]"
                : "text-[var(--app-body)] hover:bg-[var(--app-canvas-soft)]"
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
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
        <p className="mt-5 text-sm text-[var(--app-body)]">
          {overview.primaryBrand ? (
            <>
              <strong className="font-semibold text-[var(--app-ink)]">
                {overview.metric.mentionedAnswers}
              </strong>{" "}
              of {overview.metric.successfulAnswers} successful answers mention{" "}
              <strong className="font-semibold text-[var(--app-ink)]">
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Answer coverage
        </p>
        <p className="ai-visibility-display mt-3 text-4xl tabular-nums">
          {overview.metric.coveragePct == null
            ? "—"
            : formatPercent(overview.metric.coveragePct)}
        </p>
        <p className="mt-3 text-sm text-[var(--app-body)]">
          {overview.metric.successfulAnswers} successful of{" "}
          {overview.metric.expectedAnswers} expected
        </p>
        <div className="mt-4 border-t border-[var(--app-hairline)] pt-3 text-xs text-[var(--app-muted)]">
          <p>
            {overview.metric.failedAnswers} failed ·{" "}
            {overview.successfulModels.length} successful{" "}
            {overview.successfulModels.length === 1 ? "platform" : "platforms"}
          </p>
          <p className="mt-1 truncate">
            {overview.successfulModels.length > 0
              ? overview.successfulModels.map(formatAiModelLabel).join(", ")
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
      <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--app-canvas-soft)] px-3 py-1.5 text-xs font-medium text-[var(--app-muted)]">
        <Minus className="size-3.5" />
        {visibilityDeltaHeading(overview.comparison.status)?.badge ??
          "No comparison"}
      </span>
    );
  }
  const positive = delta > 0;
  const Icon = positive ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={`mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
        positive
          ? "bg-[var(--app-positive-soft)] text-[var(--app-positive)]"
          : delta < 0
            ? "bg-[var(--app-negative-soft)] text-[var(--app-negative)]"
            : "bg-[var(--app-canvas-soft)] text-[var(--app-muted)]"
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
        <div className="ai-visibility-card h-48 animate-pulse bg-[var(--app-surface)]" />
        <div className="ai-visibility-card h-48 animate-pulse bg-[var(--app-surface)]" />
      </div>
      <div className="ai-visibility-card h-80 animate-pulse bg-[var(--app-surface)]" />
    </PageFrame>
  );
}

function formatPercent(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
