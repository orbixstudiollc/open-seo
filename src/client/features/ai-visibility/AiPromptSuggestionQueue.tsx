import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  decideAiPromptSuggestion,
  refreshAiPromptSuggestions,
  type getAiVisibilitySetupState,
} from "@/serverFunctions/ai-visibility-setup";

type SetupState = Awaited<ReturnType<typeof getAiVisibilitySetupState>>;

export function AiPromptSuggestionQueue({
  projectId,
  setupState,
  onStateChange,
}: {
  projectId: string;
  setupState: SetupState;
  onStateChange: () => Promise<void>;
}) {
  const promptSets = setupState.promptSets.filter(
    (definition) =>
      definition.promptSet.isActive && !definition.promptSet.archivedAt,
  );
  const [promptSetId, setPromptSetId] = useState(
    promptSets[0]?.promptSet.id ?? "",
  );
  const activeSet =
    promptSets.find((definition) => definition.promptSet.id === promptSetId) ??
    promptSets[0] ??
    null;
  const suggestions =
    activeSet?.prompts.filter(
      (prompt) => prompt.state === "suggested" && !prompt.archivedAt,
    ) ?? [];
  const refresh = useMutation({
    mutationFn: () =>
      refreshAiPromptSuggestions({
        data: { projectId, promptSetId: activeSet?.promptSet.id ?? "" },
      }),
    onSuccess: () => onStateChange(),
  });
  const decision = useMutation({
    mutationFn: (input: {
      trackedPromptId: string;
      decision: "approve" | "reject";
    }) =>
      decideAiPromptSuggestion({
        data: {
          projectId,
          promptSetId: activeSet?.promptSet.id ?? "",
          ...input,
        },
      }),
    onSuccess: () => onStateChange(),
  });
  const error = refresh.error ?? decision.error;

  if (!activeSet) return null;
  return (
    <section className="ai-visibility-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[var(--app-hairline)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Search className="size-4" />
            <h2 className="text-base font-semibold">Prompt suggestions</h2>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--app-muted)]">
            Question and comparison queries from Search Console, plus gaps in
            your existing topics. Finding suggestions never calls a paid answer
            provider.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {promptSets.length > 1 ? (
            <select
              aria-label="Suggestion prompt set"
              className="select h-10"
              value={activeSet.promptSet.id}
              onChange={(event) => setPromptSetId(event.target.value)}
            >
              {promptSets.map((definition) => (
                <option
                  key={definition.promptSet.id}
                  value={definition.promptSet.id}
                >
                  {definition.promptSet.name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 text-sm font-medium text-[var(--app-on-primary)] disabled:opacity-50"
            disabled={refresh.isPending || decision.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Find suggestions
          </button>
        </div>
      </div>

      <SourceStatus setupState={setupState} />

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-[var(--app-hairline)] bg-[var(--app-negative-soft)] px-5 py-3 text-sm text-[var(--app-negative)]"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {getStandardErrorMessage(
            error,
            "Couldn't update prompt suggestions.",
          )}
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <ul className="divide-y divide-[var(--app-hairline)]">
          {suggestions.map((prompt) => (
            <li
              key={prompt.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{prompt.prompt}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--app-muted)]">
                  <span className="rounded-full bg-[var(--app-canvas-soft)] px-2 py-1 font-semibold uppercase tracking-[0.06em]">
                    {prompt.suggestionSource === "gsc"
                      ? "Search Console"
                      : "Topic gap"}
                  </span>
                  {prompt.topicId ? (
                    <span>
                      {
                        activeSet.topics.find(
                          (topic) => topic.id === prompt.topicId,
                        )?.name
                      }
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--app-hairline-strong)] px-3 text-sm font-medium disabled:opacity-50"
                  disabled={decision.isPending}
                  onClick={() =>
                    decision.mutate({
                      trackedPromptId: prompt.id,
                      decision: "reject",
                    })
                  }
                >
                  <X className="size-4" />
                  Reject
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--app-primary)] px-3 text-sm font-medium text-[var(--app-on-primary)] disabled:opacity-50"
                  disabled={decision.isPending}
                  onClick={() =>
                    decision.mutate({
                      trackedPromptId: prompt.id,
                      decision: "approve",
                    })
                  }
                >
                  <Check className="size-4" />
                  Approve
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium">No suggestions waiting</p>
          <p className="mx-auto mt-1 max-w-lg text-xs text-[var(--app-muted)]">
            Find suggestions to inspect current Search Console demand and topic
            coverage. Rejected prompts remain hidden on future refreshes.
          </p>
        </div>
      )}
    </section>
  );
}

function SourceStatus({ setupState }: { setupState: SetupState }) {
  return (
    <div className="border-b border-[var(--app-hairline)] bg-[var(--app-canvas-soft)] px-5 py-3 text-xs text-[var(--app-body)]">
      {setupState.searchConsole.connected ? (
        <>
          Search Console source:{" "}
          <strong className="font-semibold text-[var(--app-ink)]">
            {setupState.searchConsole.siteUrl}
          </strong>
        </>
      ) : (
        <>
          Search Console is not connected. Topic-gap suggestions are still
          available.
        </>
      )}
    </div>
  );
}
