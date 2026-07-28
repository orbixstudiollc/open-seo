/* eslint-disable max-lines -- the answer reader keeps its filter, evidence, and raw-text rendering together. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { formatAiModelLabel } from "@/shared/aiVisibilityLabels";
import { getAnswerExplorer } from "@/serverFunctions/ai-answer-explorer";
import type {
  AnswerExplorerItem,
  AnswerExplorerMention,
  RunnableTrackedPrompt,
} from "@/types/schemas/ai-answer-explorer";
import {
  promptExplorerModelSchema,
  type PromptExplorerModel,
} from "@/types/schemas/ai-search";
import { buildAnswerTextSegments } from "./answerHighlights";
import { TrackedPromptRunButton } from "./TrackedPromptRunButton";

type SearchState = {
  answerId?: string;
  promptId?: string;
  model?: PromptExplorerModel;
  page?: number;
};

export function AnswerExplorerPage({
  projectId,
  search,
  onSearchChange,
}: {
  projectId: string;
  search: SearchState;
  onSearchChange: (updates: SearchState) => void;
}) {
  const page = search.page ?? 1;
  const query = useQuery({
    queryKey: [
      "ai-answer-explorer",
      projectId,
      search.answerId,
      search.promptId,
      search.model,
      page,
    ],
    queryFn: () =>
      getAnswerExplorer({
        data: {
          projectId,
          answerId: search.answerId,
          trackedPromptId: search.promptId,
          model: search.model,
          page,
        },
      }),
  });

  return (
    <PageFrame>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link
            to="/p/$projectId/visibility"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--app-muted)] hover:text-[var(--app-ink)]"
          >
            <ArrowLeft className="size-3.5" />
            AI Visibility
          </Link>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
            Stored evidence
          </p>
          <h1 className="ai-visibility-display mt-2 text-[30px] leading-tight sm:text-4xl">
            Answer explorer
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--app-body)]">
            Read the exact stored response for each prompt and model, with
            detected brand mentions and citations kept in context.
          </p>
        </div>
      </header>

      {query.isPending ? <LoadingState /> : null}
      {query.isError ? (
        <ErrorState
          message={getStandardErrorMessage(
            query.error,
            "Couldn't load stored answers.",
          )}
        />
      ) : null}
      {query.data ? (
        <>
          <AnswerFilters
            prompts={query.data.prompts}
            models={query.data.models}
            search={search}
            onChange={onSearchChange}
          />
          <TrackedPromptList
            projectId={projectId}
            prompts={query.data.prompts}
          />
          {search.answerId ? (
            <button
              type="button"
              className="btn btn-sm self-start"
              onClick={() =>
                onSearchChange({ ...search, answerId: undefined, page: 1 })
              }
            >
              Show all matching answers
            </button>
          ) : null}
          <AnswerList answers={query.data.answers} />
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            onPageChange={(nextPage) =>
              onSearchChange({
                ...search,
                answerId: undefined,
                page: nextPage === 1 ? undefined : nextPage,
              })
            }
          />
        </>
      ) : null}
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="ai-visibility-page min-h-full overflow-auto px-4 py-6 pb-24 sm:px-6 lg:py-8">
      <main className="mx-auto max-w-[1000px] space-y-4">{children}</main>
    </div>
  );
}

function AnswerFilters({
  prompts,
  models,
  search,
  onChange,
}: {
  prompts: RunnableTrackedPrompt[];
  models: string[];
  search: SearchState;
  onChange: (updates: SearchState) => void;
}) {
  return (
    <section className="ai-visibility-card grid gap-4 p-4 sm:grid-cols-2">
      <label className="text-xs font-medium text-[var(--app-body)]">
        Prompt
        <select
          className="select mt-1.5 w-full"
          value={search.promptId ?? ""}
          onChange={(event) =>
            onChange({
              model: search.model,
              promptId: event.target.value || undefined,
            })
          }
        >
          <option value="">All tracked prompts</option>
          {prompts.map((prompt) => (
            <option key={prompt.trackedPromptId} value={prompt.trackedPromptId}>
              {prompt.promptText}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-[var(--app-body)]">
        Model
        <select
          className="select mt-1.5 w-full"
          value={search.model ?? ""}
          onChange={(event) =>
            onChange({
              promptId: search.promptId,
              model: selectedModel(event.target.value),
            })
          }
        >
          <option value="">All enabled models</option>
          {models.map((model) => (
            <option key={model} value={model}>
              {formatAiModelLabel(model)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function TrackedPromptList({
  projectId,
  prompts,
}: {
  projectId: string;
  prompts: RunnableTrackedPrompt[];
}) {
  if (prompts.length === 0) return null;
  return (
    <details className="ai-visibility-card overflow-hidden">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">
        Tracked prompts ({prompts.length})
      </summary>
      <ul className="divide-y divide-[var(--app-hairline)] border-t border-[var(--app-hairline)]">
        {prompts.map((prompt) => (
          <li
            key={prompt.trackedPromptId}
            className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">
                {prompt.promptText}
              </p>
              <p className="mt-0.5 text-xs text-[var(--app-muted)]">
                {prompt.promptSetName} · {prompt.enabledModels.length} enabled{" "}
                {prompt.enabledModels.length === 1 ? "model" : "models"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/p/$projectId/visibility/answers"
                params={{ projectId }}
                search={{ promptId: prompt.trackedPromptId }}
                className="btn btn-xs"
              >
                View answers
              </Link>
              <TrackedPromptRunButton
                compact
                projectId={projectId}
                promptSetId={prompt.promptSetId}
                trackedPromptId={prompt.trackedPromptId}
                modelCount={prompt.enabledModels.length}
              />
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AnswerList({ answers }: { answers: AnswerExplorerItem[] }) {
  if (answers.length === 0) {
    return (
      <section className="ai-visibility-card px-5 py-14 text-center">
        <BookOpenText className="mx-auto size-8 text-[var(--app-muted)]" />
        <p className="mt-3 text-sm font-medium">No stored answers match</p>
        <p className="mt-1 text-xs text-[var(--app-muted)]">
          Run the prompt once or choose a different prompt and model.
        </p>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      {answers.map((answer) => (
        <AnswerCard key={answer.id} answer={answer} />
      ))}
    </div>
  );
}

function AnswerCard({ answer }: { answer: AnswerExplorerItem }) {
  const segments = buildAnswerTextSegments(
    answer.responseText,
    answer.mentions,
  );
  return (
    <article className="ai-visibility-card overflow-hidden">
      <div className="border-b border-[var(--app-hairline)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--app-surface-strong)] px-2.5 py-1 text-[11px] font-semibold">
            {formatAiModelLabel(answer.model)}
          </span>
          {answer.modelName ? (
            <span className="font-mono text-[11px] text-[var(--app-muted)]">
              {answer.modelName}
            </span>
          ) : null}
          <time className="ml-auto text-xs text-[var(--app-muted)]">
            {formatTimestamp(answer.observedAt)}
          </time>
        </div>
        <h2 className="mt-3 text-base font-semibold leading-snug">
          {answer.promptText}
        </h2>
        {answer.mentions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {answer.mentions.map((mention) => (
              <MentionBadge key={mention.id} mention={mention} />
            ))}
          </div>
        ) : null}
      </div>
      <div className="px-5 py-5">
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--app-ink)]">
          {segments.map((segment, index) =>
            segment.mention ? (
              <mark
                key={`${segment.mention.id}-${index}`}
                className="rounded-sm bg-[var(--app-warning-soft)] px-0.5 text-[var(--app-ink)]"
                title={mentionSummary(segment.mention)}
              >
                {segment.text}
              </mark>
            ) : (
              <span key={`text-${index}`}>{segment.text}</span>
            ),
          )}
        </p>
      </div>
      <CitationList answer={answer} />
    </article>
  );
}

function MentionBadge({ mention }: { mention: AnswerExplorerMention }) {
  const sentimentClass =
    mention.sentiment === "positive"
      ? "text-[var(--app-positive)]"
      : mention.sentiment === "negative"
        ? "text-[var(--app-negative)]"
        : "text-[var(--app-muted)]";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--app-hairline)] px-2.5 py-1 text-[11px]">
      <strong className="font-semibold">{mention.brandName}</strong>
      <span className={sentimentClass}>{mention.sentiment ?? "unscored"}</span>
      <span className="text-[var(--app-muted)]">
        {mention.position == null ? "position —" : `#${mention.position}`}
      </span>
    </span>
  );
}

function CitationList({ answer }: { answer: AnswerExplorerItem }) {
  if (answer.citations.length === 0) return null;
  return (
    <div className="border-t border-[var(--app-hairline)] bg-[var(--app-canvas-soft)] px-5 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--app-muted)]">
        Citations
      </h3>
      <ol className="mt-3 space-y-2">
        {answer.citations.map((citation) => (
          <li key={citation.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-[var(--app-muted)]">
              {citation.order + 1}.
            </span>
            <div className="min-w-0">
              <SafeExternalLink
                url={citation.url}
                label={citation.title ?? citation.domain ?? "Open cited source"}
                className="inline-flex max-w-full items-center gap-1.5 break-words font-medium text-[var(--app-ink)] underline decoration-[var(--app-hairline-strong)] underline-offset-2"
              />
              {citation.domain ? (
                <p className="mt-0.5 text-xs text-[var(--app-muted)]">
                  {citation.domain}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <nav
      aria-label="Answer pages"
      className="flex items-center justify-between py-2"
    >
      <p className="text-xs text-[var(--app-muted)]">
        {total} stored {total === 1 ? "answer" : "answers"} · page {page} of{" "}
        {Math.max(totalPages, 1)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-sm px-3"
          disabled={page <= 1}
          aria-label="Previous answer page"
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          className="btn btn-sm px-3"
          disabled={page >= totalPages}
          aria-label="Next answer page"
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

function LoadingState() {
  return (
    <>
      <div className="ai-visibility-card h-24 animate-pulse" />
      <div className="ai-visibility-card h-80 animate-pulse" />
    </>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="ai-visibility-card flex items-start gap-3 border-[var(--app-negative)]/30 px-5 py-4 text-sm text-[var(--app-negative)]"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {message}
    </div>
  );
}

function mentionSummary(mention: AnswerExplorerMention): string {
  const sentiment = mention.sentiment ?? "unscored sentiment";
  const position =
    mention.position == null
      ? "unknown position"
      : `position ${mention.position}`;
  return `${mention.brandName}: ${sentiment}, ${position}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function selectedModel(value: string): PromptExplorerModel | undefined {
  const parsed = promptExplorerModelSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
