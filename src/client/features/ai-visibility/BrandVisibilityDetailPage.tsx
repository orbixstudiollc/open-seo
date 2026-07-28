/* eslint-disable max-lines -- the brand drill-down keeps its compact analytics cards and evidence list colocated. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Minus } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { formatAiModelLabel } from "@/shared/aiVisibilityLabels";
import { getBrandVisibilityDetail } from "@/serverFunctions/ai-answer-explorer";
import type { BrandVisibilityDetail } from "@/types/schemas/ai-answer-explorer";
import type { VisibilityWindow } from "@/types/schemas/ai-visibility-analytics";

const WINDOWS: VisibilityWindow[] = [7, 30, 90];

export function BrandVisibilityDetailPage({
  projectId,
  brandId,
  windowDays,
  onWindowChange,
}: {
  projectId: string;
  brandId: string;
  windowDays: VisibilityWindow;
  onWindowChange: (window: VisibilityWindow) => void;
}) {
  const query = useQuery({
    queryKey: ["ai-brand-visibility-detail", projectId, brandId, windowDays],
    queryFn: () =>
      getBrandVisibilityDetail({
        data: { projectId, brandId, windowDays },
      }),
    staleTime: 60_000,
  });

  return (
    <PageFrame>
      {query.isPending ? <LoadingState /> : null}
      {query.isError ? (
        <>
          <BackLink projectId={projectId} />
          <div
            role="alert"
            className="ai-visibility-card flex items-start gap-3 border-[var(--app-negative)]/30 px-5 py-4 text-sm text-[var(--app-negative)]"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {getStandardErrorMessage(
              query.error,
              "Couldn't load this brand's visibility history.",
            )}
          </div>
        </>
      ) : null}
      {query.data ? (
        <>
          <BrandHeader
            projectId={projectId}
            detail={query.data}
            onWindowChange={onWindowChange}
          />
          <MetricCards detail={query.data} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <MentionTrend detail={query.data} />
            <HistoryCard detail={query.data} />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
            <TopAnswers projectId={projectId} detail={query.data} />
            <CitationOverlap detail={query.data} />
          </div>
        </>
      ) : null}
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="ai-visibility-page min-h-full overflow-auto px-4 py-6 pb-24 sm:px-6 lg:py-8">
      <main className="mx-auto max-w-[1200px] space-y-4">{children}</main>
    </div>
  );
}

function BrandHeader({
  projectId,
  detail,
  onWindowChange,
}: {
  projectId: string;
  detail: BrandVisibilityDetail;
  onWindowChange: (window: VisibilityWindow) => void;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 pb-2 sm:flex-row sm:items-end">
      <div>
        <BackLink projectId={projectId} />
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
          Brand drill-down
        </p>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="ai-visibility-display text-[30px] leading-tight sm:text-4xl">
            {detail.brand.name}
          </h1>
          {detail.brand.isPrimary ? (
            <span className="rounded-full bg-[var(--app-ink)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--app-canvas)]">
              You
            </span>
          ) : null}
        </div>
        <p className="mt-2 max-w-xl text-sm text-[var(--app-body)]">
          Answer-level mentions, sentiment, first-mention position, and cited
          source overlap.
        </p>
      </div>
      <div
        role="group"
        aria-label="Brand visibility period"
        className="inline-flex self-start rounded-lg border border-[var(--app-hairline-strong)] bg-[var(--app-surface)] p-1 sm:self-auto"
      >
        {WINDOWS.map((days) => (
          <button
            key={days}
            type="button"
            aria-pressed={detail.windowDays === days}
            className={`h-10 min-w-14 rounded-md px-3 text-sm font-medium transition-colors ${
              detail.windowDays === days
                ? "bg-[var(--app-ink)] text-[var(--app-canvas)]"
                : "text-[var(--app-body)] hover:bg-[var(--app-canvas-soft)]"
            }`}
            onClick={() => onWindowChange(days)}
          >
            {days}d
          </button>
        ))}
      </div>
    </header>
  );
}

function BackLink({ projectId }: { projectId: string }) {
  return (
    <Link
      to="/p/$projectId/visibility"
      params={{ projectId }}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--app-muted)] hover:text-[var(--app-ink)]"
    >
      <ArrowLeft className="size-3.5" />
      Brand leaderboard
    </Link>
  );
}

function MetricCards({ detail }: { detail: BrandVisibilityDetail }) {
  const cards = [
    {
      label: "Mention rate",
      value: formatPercent(detail.metric.mentionRatePct),
      note: `${detail.metric.mentionedAnswers} of ${detail.metric.successfulAnswers} successful answers`,
    },
    {
      label: "Mention volume",
      value: detail.metric.mentionCount.toLocaleString(),
      note: "Stored body-text mentions",
    },
    {
      label: "Sentiment estimate",
      value: formatSentiment(detail.metric.sentimentEstimate),
      note: "−1 negative to +1 positive",
    },
    {
      label: "Average position",
      value:
        detail.metric.averagePosition == null
          ? "—"
          : `#${formatNumber(detail.metric.averagePosition)}`,
      note: "First distinct brand mention",
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <section key={card.label} className="ai-visibility-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
            {card.label}
          </p>
          <p className="ai-visibility-display mt-3 text-3xl tabular-nums">
            {card.value}
          </p>
          <p className="mt-2 text-xs text-[var(--app-muted)]">{card.note}</p>
        </section>
      ))}
    </div>
  );
}

function MentionTrend({ detail }: { detail: BrandVisibilityDetail }) {
  const maxMentions = Math.max(
    1,
    ...detail.mentionTrend.map((point) => point.mentions),
  );
  return (
    <section className="ai-visibility-card overflow-hidden">
      <CardHeader
        title="Mention trend"
        description="Successful answers in the selected half-open window."
      />
      {detail.mentionTrend.length > 0 ? (
        <ul className="divide-y divide-[var(--app-hairline)]">
          {detail.mentionTrend.map((point) => (
            <li key={point.date} className="px-5 py-3.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <time className="font-medium">{formatDay(point.date)}</time>
                <span className="text-xs tabular-nums text-[var(--app-muted)]">
                  {point.mentions} mentions · {point.mentionedAnswers}/
                  {point.successfulAnswers} answers
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--app-hairline)]">
                <div
                  className="h-full rounded-full bg-[var(--app-ink)]"
                  style={{
                    width: `${(point.mentions / maxMentions) * 100}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState label="No successful answers in this period." />
      )}
    </section>
  );
}

function HistoryCard({ detail }: { detail: BrandVisibilityDetail }) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <CardHeader
        title="Sentiment and position history"
        description="Missing scores stay unavailable rather than becoming zero."
      />
      {detail.sentimentHistory.length > 0 ? (
        <ul className="divide-y divide-[var(--app-hairline)]">
          {detail.sentimentHistory.map((point, index) => {
            const position = detail.positionHistory[index];
            return (
              <li
                key={point.date}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-3.5 text-sm"
              >
                <time className="font-medium">{formatDay(point.date)}</time>
                <span
                  className={sentimentClass(point.sentimentEstimate)}
                  title={`${point.scoredAnswers} scored answers`}
                >
                  {formatSentiment(point.sentimentEstimate)}
                </span>
                <span
                  className="w-14 text-right tabular-nums text-[var(--app-muted)]"
                  title={`${position?.positionedAnswers ?? 0} positioned answers`}
                >
                  {position?.averagePosition == null
                    ? "—"
                    : `#${formatNumber(position.averagePosition)}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState label="No sentiment or position history yet." />
      )}
    </section>
  );
}

function TopAnswers({
  projectId,
  detail,
}: {
  projectId: string;
  detail: BrandVisibilityDetail;
}) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <CardHeader
        title="Top answers"
        description={`Latest stored answers mentioning ${detail.brand.name}.`}
      />
      {detail.topAnswers.length > 0 ? (
        <ul className="divide-y divide-[var(--app-hairline)]">
          {detail.topAnswers.map((answer) => (
            <li key={answer.answerId} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[var(--app-surface-strong)] px-2 py-0.5 font-semibold">
                  {formatAiModelLabel(answer.model)}
                </span>
                <span
                  className={sentimentClass(sentimentScore(answer.sentiment))}
                >
                  {answer.sentiment ?? "unscored"}
                </span>
                <span className="text-[var(--app-muted)]">
                  {answer.position == null
                    ? "position —"
                    : `position #${answer.position}`}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-semibold">
                {answer.promptText}
              </h3>
              <p className="mt-1.5 text-[13px] leading-5 text-[var(--app-body)]">
                {answer.excerpt || "Stored answer has no preview text."}
              </p>
              <Link
                to="/p/$projectId/visibility/answers"
                params={{ projectId }}
                search={{ answerId: answer.answerId }}
                className="mt-2 inline-flex text-xs font-semibold text-[var(--app-ink)] underline decoration-[var(--app-hairline-strong)] underline-offset-2"
              >
                Read full answer
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState label="No stored answers mention this brand yet." />
      )}
    </section>
  );
}

function CitationOverlap({ detail }: { detail: BrandVisibilityDetail }) {
  const overlap = detail.citationOverlap;
  return (
    <section className="ai-visibility-card overflow-hidden">
      <CardHeader
        title="Citation overlap"
        description="Sources appearing in answers that mention this brand."
      />
      <div className="px-5 py-4">
        <p className="ai-visibility-display text-3xl tabular-nums">
          {formatPercent(overlap.overlapPct)}
        </p>
        <p className="mt-1 text-xs text-[var(--app-muted)]">
          {overlap.citedAnswers} of {overlap.mentionedAnswers} mentioned answers
          include a citation.
        </p>
      </div>
      {overlap.domains.length > 0 ? (
        <ul className="divide-y divide-[var(--app-hairline)] border-t border-[var(--app-hairline)]">
          {overlap.domains.map((domain) => (
            <li
              key={domain.domain}
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <span className="min-w-0 truncate font-medium">
                {domain.domain}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--app-muted)]">
                {domain.answerCount} answers ·{" "}
                {formatPercent(domain.overlapPct)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CardHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-[var(--app-hairline)] px-5 py-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-[13px] text-[var(--app-muted)]">
        {description}
      </p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="px-5 py-10 text-center text-sm text-[var(--app-muted)]">
      <Minus className="mx-auto mb-2 size-4" />
      {label}
    </p>
  );
}

function LoadingState() {
  return (
    <>
      <div className="h-20 w-72 animate-pulse rounded-lg bg-[var(--app-hairline)]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="ai-visibility-card h-32 animate-pulse" />
        ))}
      </div>
      <div className="ai-visibility-card h-72 animate-pulse" />
    </>
  );
}

function sentimentScore(
  sentiment: "positive" | "neutral" | "negative" | null,
): number | null {
  return sentiment === "positive"
    ? 1
    : sentiment === "negative"
      ? -1
      : sentiment === "neutral"
        ? 0
        : null;
}

function sentimentClass(value: number | null): string {
  return value == null || value === 0
    ? "tabular-nums text-[var(--app-muted)]"
    : value > 0
      ? "tabular-nums text-[var(--app-positive)]"
      : "tabular-nums text-[var(--app-negative)]";
}

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${formatNumber(value)}%`;
}

function formatSentiment(value: number | null): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
