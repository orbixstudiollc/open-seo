/* eslint-disable max-lines -- the route-owned queue keeps its filters, cards, and evidence disclosure colocated. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ClipboardList,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  generateRecommendationQueue,
  getRecommendationQueue,
  setRecommendationStatus,
} from "@/serverFunctions/recommendations";
import {
  recommendationStatusSchema,
  type RecommendationCategory,
  type RecommendationItem,
  type RecommendationQueue,
  type RecommendationStatus,
} from "@/types/schemas/recommendations";

const CATEGORIES: Array<{
  value: "all" | RecommendationCategory;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "off_page", label: "Off-Page" },
  { value: "on_page", label: "On-Page" },
  { value: "technical", label: "Technical" },
];
const STATUSES: Array<{ value: RecommendationStatus; label: string }> = [
  { value: "todo", label: "Todo" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
];

export function RecommendationPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["recommendations", projectId] as const;
  const [category, setCategory] = useState<"all" | RecommendationCategory>(
    "all",
  );
  const [status, setStatus] = useState<RecommendationStatus>("todo");
  const query = useQuery({
    queryKey,
    queryFn: () => getRecommendationQueue({ data: { projectId } }),
  });
  const generate = useMutation({
    mutationFn: () => generateRecommendationQueue({ data: { projectId } }),
    onSuccess: (queue) => queryClient.setQueryData(queryKey, queue),
  });
  const transition = useMutation({
    mutationFn: (input: {
      recommendationId: string;
      status: RecommendationStatus;
    }) =>
      setRecommendationStatus({
        data: { projectId, ...input },
      }),
    onSuccess: (queue) => queryClient.setQueryData(queryKey, queue),
  });
  const items = useMemo(
    () =>
      (query.data?.items ?? []).filter(
        (item) =>
          item.status === status &&
          (category === "all" || item.category === category) &&
          (status !== "todo" || item.isActive),
      ),
    [category, query.data?.items, status],
  );

  return (
    <div className="ai-visibility-page min-h-full overflow-auto px-4 py-6 pb-24 sm:px-6 lg:py-8">
      <main className="mx-auto max-w-[1200px] space-y-4">
        <RecommendationHeader
          queue={query.data}
          isGenerating={generate.isPending}
          onGenerate={() => generate.mutate()}
        />
        {query.isPending ? (
          <RecommendationSkeleton />
        ) : query.isError ? (
          <ErrorCard
            message={getStandardErrorMessage(
              query.error,
              "Couldn't load the recommendation queue.",
            )}
          />
        ) : (
          <>
            <QueueSummary queue={query.data} />
            <QueueFilters
              queue={query.data}
              category={category}
              status={status}
              onCategoryChange={setCategory}
              onStatusChange={setStatus}
            />
            {generate.isError ? (
              <ErrorCard
                message={getStandardErrorMessage(
                  generate.error,
                  "Couldn't regenerate recommendations.",
                )}
              />
            ) : null}
            {transition.isError ? (
              <ErrorCard
                message={getStandardErrorMessage(
                  transition.error,
                  "Couldn't update recommendation status.",
                )}
              />
            ) : null}
            {items.length > 0 ? (
              <div className="space-y-3">
                {items.map((item) => (
                  <RecommendationCard
                    key={item.id}
                    item={item}
                    isUpdating={
                      transition.isPending &&
                      transition.variables?.recommendationId === item.id
                    }
                    onStatusChange={(nextStatus) =>
                      transition.mutate({
                        recommendationId: item.id,
                        status: nextStatus,
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <QueueEmpty
                hasGenerated={query.data.generatedAt !== null}
                status={status}
                onGenerate={() => generate.mutate()}
                isGenerating={generate.isPending}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function RecommendationHeader({
  queue,
  isGenerating,
  onGenerate,
}: {
  queue: RecommendationQueue | undefined;
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 pb-2 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
          Evidence-carrying work queue
        </p>
        <h1 className="ai-visibility-display mt-2 text-[30px] leading-tight sm:text-4xl">
          Recommendations
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--visibility-body)]">
          Prioritized actions from exact citation gaps and real Site Audit
          findings. Every score and source stays inspectable.
        </p>
        {queue?.generatedAt ? (
          <p className="mt-2 text-xs text-[var(--visibility-muted)]">
            Last generated {formatDateTime(queue.generatedAt)}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={isGenerating}
        onClick={onGenerate}
        className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-lg bg-[var(--visibility-accent)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--visibility-accent-active)] disabled:cursor-wait disabled:opacity-60 sm:self-auto"
      >
        <RefreshCw className={`size-4 ${isGenerating ? "animate-spin" : ""}`} />
        {isGenerating
          ? "Generating…"
          : queue?.generatedAt
            ? "Regenerate"
            : "Generate queue"}
      </button>
    </header>
  );
}

function QueueSummary({ queue }: { queue: RecommendationQueue }) {
  const active = queue.items.filter((item) => item.isActive);
  const cards = [
    {
      label: "Todo",
      value: active.filter((item) => item.status === "todo").length,
      detail: "Current actions",
    },
    {
      label: "High priority",
      value: active.filter(
        (item) => item.status === "todo" && item.priorityLevel === "high",
      ).length,
      detail: "70+ explainable score",
    },
    {
      label: "Evidence links",
      value: active.reduce(
        (total, item) =>
          total + item.auditEvidence.length + item.citationEvidence.length,
        0,
      ),
      detail: "Audit and citation records",
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <section key={card.label} className="ai-visibility-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
            {card.label}
          </p>
          <p className="ai-visibility-display mt-3 text-4xl tabular-nums">
            {card.value.toLocaleString()}
          </p>
          <p className="mt-3 text-xs text-[var(--visibility-muted)]">
            {card.detail}
          </p>
        </section>
      ))}
    </div>
  );
}

function QueueFilters({
  queue,
  category,
  status,
  onCategoryChange,
  onStatusChange,
}: {
  queue: RecommendationQueue;
  category: "all" | RecommendationCategory;
  status: RecommendationStatus;
  onCategoryChange: (value: "all" | RecommendationCategory) => void;
  onStatusChange: (value: RecommendationStatus) => void;
}) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Recommendation category"
          className="flex max-w-full gap-1 overflow-x-auto"
        >
          {CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={category === option.value}
              onClick={() => onCategoryChange(option.value)}
              className={`h-10 shrink-0 rounded-md px-3 text-sm font-medium ${
                category === option.value
                  ? "bg-[var(--visibility-ink)] text-[var(--visibility-canvas)]"
                  : "text-[var(--visibility-body)] hover:bg-[var(--visibility-canvas-soft)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div
          role="tablist"
          aria-label="Recommendation workflow status"
          className="flex gap-1"
        >
          {STATUSES.map((option) => {
            const count = queue.items.filter(
              (item) =>
                item.status === option.value &&
                (option.value !== "todo" || item.isActive),
            ).length;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={status === option.value}
                onClick={() => onStatusChange(option.value)}
                className={`h-10 rounded-md px-3 text-sm font-medium ${
                  status === option.value
                    ? "bg-[var(--visibility-accent)] text-white"
                    : "text-[var(--visibility-body)] hover:bg-[var(--visibility-canvas-soft)]"
                }`}
              >
                {option.label}{" "}
                <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RecommendationCard({
  item,
  isUpdating,
  onStatusChange,
}: {
  item: RecommendationItem;
  isUpdating: boolean;
  onStatusChange: (status: RecommendationStatus) => void;
}) {
  return (
    <article className="ai-visibility-card overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge item={item} />
              <span className="rounded-full bg-[var(--visibility-canvas-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--visibility-muted)]">
                {categoryLabel(item.category)}
              </span>
              {item.targetCommunity ? (
                <span className="rounded-full border border-[var(--visibility-hairline)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--visibility-body)]">
                  {item.targetCommunity}
                </span>
              ) : null}
              {!item.isActive ? (
                <span className="rounded-full border border-[var(--visibility-hairline)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--visibility-muted)]">
                  No longer produced
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-lg font-semibold leading-snug">
              {item.title}
            </h2>
            <TargetLink item={item} />
          </div>
          <label className="relative shrink-0">
            <span className="sr-only">Workflow status</span>
            <select
              value={item.status}
              disabled={isUpdating}
              onChange={(event) => {
                const status = recommendationStatusSchema.safeParse(
                  event.target.value,
                );
                if (status.success) onStatusChange(status.data);
              }}
              className="h-11 appearance-none rounded-lg border border-[var(--visibility-hairline-strong)] bg-[var(--visibility-surface)] py-2 pr-9 pl-3 text-sm font-medium text-[var(--visibility-ink)] disabled:opacity-60"
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-3.5 right-3 size-4 text-[var(--visibility-muted)]" />
          </label>
        </div>
        <div className="mt-5 grid gap-4 border-t border-[var(--visibility-hairline)] pt-5 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
              Action
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--visibility-body)]">
              {item.action}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
              Why this exists
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--visibility-body)]">
              {item.rationale}
            </p>
          </div>
        </div>
      </div>
      <div className="grid border-t border-[var(--visibility-hairline)] lg:grid-cols-2 lg:divide-x lg:divide-[var(--visibility-hairline)]">
        <ScoreDisclosure item={item} />
        <EvidenceDisclosure item={item} />
      </div>
    </article>
  );
}

function PriorityBadge({ item }: { item: RecommendationItem }) {
  const className =
    item.priorityLevel === "high"
      ? "bg-[var(--visibility-negative-soft)] text-[var(--visibility-negative)]"
      : item.priorityLevel === "medium"
        ? "bg-[var(--visibility-canvas-soft)] text-[var(--visibility-accent)]"
        : "bg-[var(--visibility-canvas-soft)] text-[var(--visibility-muted)]";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${className}`}
    >
      {item.priorityLevel} · {item.priorityScore}/100
    </span>
  );
}

function TargetLink({ item }: { item: RecommendationItem }) {
  if (!item.targetUrl) {
    return (
      <p className="mt-2 break-all text-sm text-[var(--visibility-muted)]">
        {item.targetLabel}
      </p>
    );
  }
  return (
    <a
      href={item.targetUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex max-w-full items-center gap-1.5 text-sm text-[var(--visibility-body)] underline decoration-[var(--visibility-hairline-strong)] underline-offset-4 hover:decoration-[var(--visibility-accent)]"
      title={item.targetUrl}
    >
      <span className="truncate">{item.targetLabel}</span>
      <ArrowUpRight className="size-3.5 shrink-0" />
    </a>
  );
}

function ScoreDisclosure({ item }: { item: RecommendationItem }) {
  return (
    <details className="group bg-[var(--visibility-canvas-soft)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold">
        <span>Why the priority is {item.priorityScore}/100</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-[var(--visibility-hairline)] px-5 py-4">
        {item.scoreFactors.map((factor) => (
          <div key={factor.factorKey}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">{factor.label}</span>
              <span className="tabular-nums text-[var(--visibility-muted)]">
                +{formatNumber(factor.contribution)} / {factor.weight}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--visibility-hairline)]">
              <div
                className="h-full rounded-full bg-[var(--visibility-accent)]"
                style={{
                  width: `${Math.min(100, (factor.contribution / factor.weight) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--visibility-muted)]">
              {factor.explanation}
            </p>
          </div>
        ))}
        <p className="border-t border-[var(--visibility-hairline)] pt-3 text-[11px] text-[var(--visibility-muted)]">
          Version {item.scoreVersion}. The score is the rounded sum of the
          visible contributions.
        </p>
      </div>
    </details>
  );
}

function EvidenceDisclosure({ item }: { item: RecommendationItem }) {
  const count = item.auditEvidence.length + item.citationEvidence.length;
  return (
    <details className="group bg-[var(--visibility-canvas-soft)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold">
        <span>
          Evidence · {count} linked record{count === 1 ? "" : "s"}
        </span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="max-h-96 space-y-3 overflow-y-auto border-t border-[var(--visibility-hairline)] px-5 py-4">
        {item.auditEvidence.map((evidence) => (
          <div
            key={evidence.id}
            className="rounded-lg border border-[var(--visibility-hairline)] bg-[var(--visibility-surface)] p-3"
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              <Check className="size-3.5 text-[var(--visibility-positive)]" />
              Real Site Audit finding
            </div>
            <p className="mt-2 break-all text-xs text-[var(--visibility-body)]">
              {evidence.pageUrl}
            </p>
            <p className="mt-1 font-mono text-[10px] text-[var(--visibility-muted)]">
              {evidence.issueType} · audit {shortId(evidence.sourceAuditId)} ·
              issue{" "}
              {evidence.auditIssueId
                ? shortId(evidence.auditIssueId)
                : "retained snapshot"}
            </p>
            {evidence.detailsJson ? (
              <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--visibility-canvas-soft)] p-2 font-mono text-[10px] text-[var(--visibility-muted)]">
                {prettyJson(evidence.detailsJson)}
              </pre>
            ) : null}
          </div>
        ))}
        {item.citationEvidence.map((evidence) => (
          <div
            key={evidence.id}
            className="rounded-lg border border-[var(--visibility-hairline)] bg-[var(--visibility-surface)] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium">
                Cited with {evidence.competitorBrandName}
              </p>
              <span className="font-mono text-[10px] text-[var(--visibility-muted)]">
                citation {evidence.citationId ?? "retained snapshot"}
              </span>
            </div>
            <a
              href={evidence.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block truncate text-xs underline decoration-[var(--visibility-hairline-strong)] underline-offset-2"
            >
              {evidence.sourceTitle ?? evidence.sourceUrl}
            </a>
            <p className="mt-2 text-xs text-[var(--visibility-body)]">
              “{evidence.promptText}”
            </p>
            <p className="mt-1 text-[10px] text-[var(--visibility-muted)]">
              {formatModel(evidence.model)} ·{" "}
              {formatDateTime(evidence.observedAt)} · answer{" "}
              {shortId(evidence.sourceAnswerId)}
            </p>
          </div>
        ))}
        <p className="text-[11px] text-[var(--visibility-muted)]">
          Evidence snapshots remain explainable if normal source-retention or
          audit deletion later removes the linked source row.
        </p>
      </div>
    </details>
  );
}

function QueueEmpty({
  hasGenerated,
  status,
  isGenerating,
  onGenerate,
}: {
  hasGenerated: boolean;
  status: RecommendationStatus;
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  return (
    <section className="ai-visibility-card px-5 py-12 text-center">
      <ClipboardList className="mx-auto size-6 text-[var(--visibility-muted)]" />
      <h2 className="mt-3 text-base font-semibold">
        {hasGenerated
          ? `No ${status} recommendations in this view`
          : "Generate the first evidence-backed queue"}
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-[var(--visibility-muted)]">
        {hasGenerated
          ? "Try another category or workflow state. Declined items stay declined when the same evidence returns."
          : "Generation reads the latest completed Site Audit and the current 30-day competitor-source gap without making provider calls."}
      </p>
      {!hasGenerated ? (
        <button
          type="button"
          disabled={isGenerating}
          onClick={onGenerate}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--visibility-accent)] px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          <RefreshCw
            className={`size-4 ${isGenerating ? "animate-spin" : ""}`}
          />
          Generate queue
        </button>
      ) : null}
    </section>
  );
}

function RecommendationSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="ai-visibility-card h-32 animate-pulse" />
        ))}
      </div>
      <div className="ai-visibility-card h-80 animate-pulse" />
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="ai-visibility-card flex items-start gap-3 border-[var(--visibility-negative)]/30 px-5 py-4 text-sm text-[var(--visibility-negative)]"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {message}
    </div>
  );
}

function categoryLabel(category: RecommendationCategory): string {
  return {
    off_page: "Off-Page",
    on_page: "On-Page",
    technical: "Technical",
  }[category];
}

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value;
}

function formatModel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
