/* eslint-disable max-lines -- one route-owned report keeps its compact table and empty-state components colocated. */
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Info, LibraryBig } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getCitationIntelligenceOverview } from "@/serverFunctions/citation-intelligence";
import type {
  CitationDomainClassification,
  CitationIntelligenceOverview,
} from "@/types/schemas/citation-intelligence";
import type { VisibilityWindow } from "@/types/schemas/ai-visibility-analytics";
import { CitationDensityTrendCard } from "./CitationDensityTrendCard";

const WINDOWS: VisibilityWindow[] = [7, 30, 90];

export function CitationIntelligencePage({
  projectId,
  windowDays,
  onWindowChange,
}: {
  projectId: string;
  windowDays: VisibilityWindow;
  onWindowChange: (window: VisibilityWindow) => void;
}) {
  const query = useQuery({
    queryKey: ["citation-intelligence", projectId, windowDays],
    queryFn: () =>
      getCitationIntelligenceOverview({
        data: { projectId, windowDays },
      }),
    staleTime: 60_000,
  });
  const header = (
    <CitationHeader windowDays={windowDays} onWindowChange={onWindowChange} />
  );

  if (query.isPending) {
    return (
      <PageFrame header={header}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="ai-visibility-card h-36 animate-pulse bg-[var(--visibility-surface)]"
            />
          ))}
        </div>
        <div className="ai-visibility-card h-80 animate-pulse bg-[var(--visibility-surface)]" />
      </PageFrame>
    );
  }

  if (query.isError) {
    return (
      <PageFrame header={header}>
        <div
          role="alert"
          className="ai-visibility-card flex items-start gap-3 border-red-500/30 px-5 py-4 text-sm text-red-700 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {getStandardErrorMessage(
            query.error,
            "Couldn't load stored citation intelligence.",
          )}
        </div>
      </PageFrame>
    );
  }

  const overview = query.data;
  return (
    <PageFrame header={header}>
      <MetricCards overview={overview} />
      <CitationDensityTrendCard overview={overview} />
      <GapReport overview={overview} />
      <ClassificationNote overview={overview} />
      <DomainTable overview={overview} />
      <UrlTable overview={overview} />
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

function CitationHeader({
  windowDays,
  onWindowChange,
}: {
  windowDays: VisibilityWindow;
  onWindowChange: (window: VisibilityWindow) => void;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 pb-2 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
          Tracked-answer corpus
        </p>
        <h1 className="ai-visibility-display mt-2 text-[30px] leading-tight sm:text-4xl">
          Citation Intelligence
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--visibility-body)]">
          Which sources models cite across stored runs—and which sources appear
          with competitors but never your primary brand.
        </p>
      </div>
      <div
        role="group"
        aria-label="Citation intelligence period"
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
            onClick={() => onWindowChange(days)}
          >
            {days}d
          </button>
        ))}
      </div>
    </header>
  );
}

function MetricCards({ overview }: { overview: CitationIntelligenceOverview }) {
  const cards = [
    {
      label: "Citations / answer",
      value:
        overview.metric.avgCitationsPerAnswer == null
          ? "—"
          : formatNumber(overview.metric.avgCitationsPerAnswer),
      detail: `${overview.metric.citations.toLocaleString()} sanitized citations`,
    },
    {
      label: "Answers with citations",
      value:
        overview.metric.citedAnswerPct == null
          ? "—"
          : formatPercent(overview.metric.citedAnswerPct),
      detail: `${overview.metric.citedAnswers} of ${overview.metric.successfulAnswers} successful`,
    },
    {
      label: "Unique domains",
      value: overview.metric.uniqueDomains.toLocaleString(),
      detail: "Registrable-domain rollup",
    },
    {
      label: "Source gaps",
      value: overview.gapReport.totalDomains.toLocaleString(),
      detail: `${overview.gapReport.trackedCompetitors} tracked competitors`,
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <section key={card.label} className="ai-visibility-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
            {card.label}
          </p>
          <p className="ai-visibility-display mt-3 text-4xl tabular-nums">
            {card.value}
          </p>
          <p className="mt-3 text-xs text-[var(--visibility-muted)]">
            {card.detail}
          </p>
        </section>
      ))}
    </div>
  );
}

function GapReport({ overview }: { overview: CitationIntelligenceOverview }) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="border-b border-[var(--visibility-hairline)] px-5 py-4">
        <div className="flex items-center gap-2">
          <LibraryBig className="size-4 text-[var(--visibility-accent)]" />
          <h2 className="text-base font-semibold">Competitor-source gaps</h2>
        </div>
        <p className="mt-1 max-w-3xl text-[13px] text-[var(--visibility-muted)]">
          {overview.gapReport.scopeNote} A citation and brand mention only prove
          answer-level co-occurrence, not that the page supports a specific
          statement.{" "}
          {overview.gapReport.truncated
            ? `Showing the top ${overview.gapReport.entries.length} of ${overview.gapReport.totalDomains} gaps.`
            : ""}
        </p>
      </div>
      {overview.gapReport.entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--visibility-hairline)] bg-[var(--visibility-canvas-soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
              <tr>
                <th className="w-14 px-5 py-3 font-semibold">Rank</th>
                <th className="px-3 py-3 font-semibold">Domain</th>
                <th className="px-3 py-3 font-semibold">Tracked competitors</th>
                <th className="px-3 py-3 text-right font-semibold">
                  Competitor answers
                </th>
                <th className="px-5 py-3 text-right font-semibold">
                  Citations
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--visibility-hairline)]">
              {overview.gapReport.entries.map((entry, index) => (
                <tr key={entry.domain}>
                  <td className="px-5 py-4 tabular-nums text-[var(--visibility-muted)]">
                    {index + 1}
                  </td>
                  <td className="px-3 py-4">
                    <p className="font-medium">{entry.domain}</p>
                    <ClassificationLabel
                      classification={entry.classification}
                    />
                  </td>
                  <td className="max-w-72 px-3 py-4 text-[var(--visibility-body)]">
                    {entry.competitorBrands
                      .map((brand) => brand.name)
                      .join(", ")}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {entry.competitorMentionedAnswers}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {entry.citationsInCompetitorAnswers}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            overview.primaryBrand
              ? "No competitor-source gaps in this window"
              : "Primary brand required"
          }
          body={
            overview.primaryBrand
              ? "No stored domain meets the competitor-only co-occurrence rule."
              : "Set a primary brand before comparing its cited sources with tracked competitors."
          }
        />
      )}
    </section>
  );
}

function ClassificationNote({
  overview,
}: {
  overview: CitationIntelligenceOverview;
}) {
  return (
    <aside className="ai-visibility-card flex items-start gap-3 bg-[var(--visibility-canvas-soft)] px-5 py-4 text-[13px] text-[var(--visibility-body)]">
      <Info className="mt-0.5 size-4 shrink-0 text-[var(--visibility-accent)]" />
      <div>
        <p className="font-semibold text-[var(--visibility-ink)]">
          How domain types are classified
        </p>
        <p className="mt-1">{overview.classificationNote}</p>
        <p className="mt-1">
          Labels are revisable domain-level defaults, not verified facts about
          every page on a site.
        </p>
      </div>
    </aside>
  );
}

function DomainTable({ overview }: { overview: CitationIntelligenceOverview }) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <TableHeader
        title="Cited domains"
        description={`Ranked across successful answers in the selected stored window. Showing ${overview.domains.length} of ${overview.metric.uniqueDomains} domains.`}
      />
      {overview.domains.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-[var(--visibility-hairline)] bg-[var(--visibility-canvas-soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Domain</th>
                <th className="px-3 py-3 font-semibold">Type · method</th>
                <th className="px-3 py-3 text-right font-semibold">
                  Citations
                </th>
                <th className="px-3 py-3 text-right font-semibold">
                  Citing answers
                </th>
                <th className="px-5 py-3 text-right font-semibold">
                  Citations / answer
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--visibility-hairline)]">
              {overview.domains.map((row) => (
                <tr key={row.domain}>
                  <td className="px-5 py-4">
                    <p className="font-medium">{row.domain}</p>
                    <p
                      className="mt-1 max-w-80 truncate text-xs text-[var(--visibility-muted)]"
                      title={row.hostnames.join(", ")}
                    >
                      {row.hostnames.join(", ")}
                    </p>
                  </td>
                  <td className="px-3 py-4">
                    <ClassificationLabel classification={row.classification} />
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {row.citations}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {row.citingAnswers}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {formatNumber(row.avgCitationsPerAnswer)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No cited domains yet"
          body="Successful stored answers in this window contain no safe citation URLs."
        />
      )}
    </section>
  );
}

function UrlTable({ overview }: { overview: CitationIntelligenceOverview }) {
  return (
    <section className="ai-visibility-card overflow-hidden">
      <TableHeader
        title="Cited pages"
        description={`Exact sanitized URLs remain distinct; query and fragment variants are not canonicalized. Showing ${overview.urls.length} of ${overview.metric.uniqueUrls} pages.`}
      />
      {overview.urls.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--visibility-hairline)] bg-[var(--visibility-canvas-soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--visibility-muted)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Page</th>
                <th className="px-3 py-3 font-semibold">Domain</th>
                <th className="px-3 py-3 text-right font-semibold">
                  Citations
                </th>
                <th className="px-3 py-3 text-right font-semibold">
                  Citing answers
                </th>
                <th className="px-5 py-3 text-right font-semibold">
                  Citations / answer
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--visibility-hairline)]">
              {overview.urls.map((row) => (
                <tr key={row.url}>
                  <td className="max-w-md px-5 py-4">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-medium underline decoration-[var(--visibility-hairline-strong)] underline-offset-2 hover:decoration-[var(--visibility-accent)]"
                      title={row.title ?? row.url}
                    >
                      {row.title ?? row.url}
                    </a>
                    <p
                      className="mt-1 truncate text-xs text-[var(--visibility-muted)]"
                      title={row.url}
                    >
                      {row.url}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-[var(--visibility-body)]">
                    {row.domain}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {row.citations}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {row.citingAnswers}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {formatNumber(row.avgCitationsPerAnswer)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No cited pages yet"
          body="Exact page rollups appear after tracked answers store safe citation URLs."
        />
      )}
    </section>
  );
}

function TableHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-[var(--visibility-hairline)] px-5 py-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-[13px] text-[var(--visibility-muted)]">
        {description}
      </p>
    </div>
  );
}

function ClassificationLabel({
  classification,
}: {
  classification: CitationDomainClassification;
}) {
  if (classification.domainType === "unknown") {
    return (
      <span className="mt-1 inline-flex rounded-full bg-[var(--visibility-canvas-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--visibility-muted)]">
        Unclassified
      </span>
    );
  }
  return (
    <span
      className="mt-1 inline-flex rounded-full border border-[var(--visibility-hairline)] bg-[var(--visibility-canvas-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--visibility-body)]"
      title={
        classification.ruleVersion
          ? `Rule version ${classification.ruleVersion}`
          : undefined
      }
    >
      {formatDomainType(classification.domainType)} ·{" "}
      {formatClassificationMethod(classification.method)}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs text-[var(--visibility-muted)]">
        {body}
      </p>
    </div>
  );
}

function formatDomainType(value: string): string {
  if (value === "ugc") return "UGC";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatClassificationMethod(
  value: CitationDomainClassification["method"],
): string {
  const labels = {
    manual: "manual review",
    curated_rule: "maintained list",
    heuristic: "narrow heuristic",
    brand_registry: "tracked brand domain",
    unclassified: "unclassified",
  };
  return labels[value];
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
