/* eslint-disable max-lines -- one review surface keeps its small table/editor components colocated. */
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  GitMerge,
  Loader2,
  RefreshCw,
  RotateCcw,
  Split,
} from "lucide-react";
import {
  applyBrandResolutionAction,
  getBrandResolutionState,
  refreshBrandResolutions,
} from "@/serverFunctions/brand-resolution";
import type { BrandResolutionAction } from "@/types/schemas/brand-resolution";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

type ResolutionState = Awaited<ReturnType<typeof getBrandResolutionState>>;
type Candidate = ResolutionState["candidates"][number];
type ActionName = BrandResolutionAction["action"];

const queryKey = (projectId: string) => ["brand-resolution", projectId];

function stateLabel(state: Candidate["decision"]["state"]) {
  if (state === "needs_review") return "Needs review";
  return state[0].toUpperCase() + state.slice(1);
}

function stateBadge(state: Candidate["decision"]["state"]) {
  if (state === "resolved") return "bg-[#dcefe5] text-[#176c4f]";
  if (state === "suppressed") return "bg-[#e6e5e0] text-[#5a5852]";
  if (state === "needs_review") return "bg-[#f4e4c8] text-[#80591f]";
  return "bg-[#ece7f3] text-[#655575]";
}

export function BrandResolutionPage({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [tab, setTab] = useState<"review" | "suppressed" | "resolved">(
    "review",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{
    action: ActionName;
    canonicalName: string;
    brandId?: string;
    reason: string;
  } | null>(null);

  const stateQuery = useQuery({
    queryKey: queryKey(projectId),
    queryFn: () => getBrandResolutionState({ data: { projectId } }),
  });
  const refresh = useMutation({
    mutationFn: () => refreshBrandResolutions({ data: { projectId } }),
    onSuccess: (result) => {
      client.setQueryData(queryKey(projectId), result.state);
    },
  });
  const applyAction = useMutation({
    mutationFn: (action: BrandResolutionAction) =>
      applyBrandResolutionAction({ data: action }),
    onSuccess: (state) => {
      client.setQueryData(queryKey(projectId), state);
      setSelected(new Set());
      setEditor(null);
    },
  });

  const state = stateQuery.data;
  const candidates = useMemo(() => {
    if (!state) return [];
    if (tab === "review") {
      return state.candidates.filter(
        (row) =>
          row.decision.state === "needs_review" ||
          row.decision.state === "unresolved",
      );
    }
    return state.candidates.filter(
      (row) => row.decision.state === "suppressed",
    );
  }, [state, tab]);

  const toggle = (normalizedName: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(normalizedName)) next.delete(normalizedName);
      else next.add(normalizedName);
      return next;
    });
  };
  const openEditor = (
    action: ActionName,
    names: string[],
    options?: { canonicalName?: string; brandId?: string; reason?: string },
  ) => {
    setSelected(new Set(names));
    setEditor({
      action,
      canonicalName: options?.canonicalName ?? "",
      brandId: options?.brandId,
      reason: options?.reason ?? "",
    });
  };

  const submitAction = () => {
    if (!editor || selected.size === 0) return;
    const common = {
      projectId,
      normalizedNames: [...selected],
      reason: editor.reason.trim(),
    };
    const action: BrandResolutionAction =
      editor.action === "merge" ||
      editor.action === "split" ||
      editor.action === "restore"
        ? {
            ...common,
            action: editor.action,
            canonicalName: editor.canonicalName.trim(),
            brandId: editor.brandId,
          }
        : { ...common, action: editor.action };
    applyAction.mutate(action);
  };

  const error =
    stateQuery.error ?? refresh.error ?? applyAction.error ?? undefined;

  return (
    <div className="min-h-full overflow-auto bg-[#f7f7f4] px-4 py-6 text-[#26251e] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#807d72]">
              AI visibility registry
            </p>
            <h1 className="mt-1 text-3xl font-normal tracking-[-0.02em]">
              Brand resolution
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#5a5852]">
              Review canonical brands without rewriting a single observed
              mention. Every decision keeps its rule, evidence, and history.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#f54e00] px-4 text-sm font-medium text-white disabled:opacity-50"
            disabled={refresh.isPending || stateQuery.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw
              className={`size-4 ${refresh.isPending ? "animate-spin" : ""}`}
            />
            Refresh rules
          </button>
        </header>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-[#cf2d56]/30 bg-white p-3 text-sm text-[#cf2d56]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {getStandardErrorMessage(error)}
          </div>
        ) : null}

        {stateQuery.isPending ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-[#807d72]" />
          </div>
        ) : state ? (
          <>
            <SummaryCards state={state} />

            {state.truncated ? (
              <div className="rounded-lg border border-[#cfcdc4] bg-white p-3 text-sm text-[#5a5852]">
                This review is bounded to the latest 5,000 mention rows.
              </div>
            ) : null}

            <div className="border-b border-[#e6e5e0]">
              <div role="tablist" className="flex gap-6">
                {(
                  [
                    [
                      "review",
                      `Review (${state.summary.needsReview + state.summary.unresolved})`,
                    ],
                    ["suppressed", `Suppressed (${state.summary.suppressed})`],
                    ["resolved", `Resolved (${state.canonicalBrands.length})`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => {
                      setTab(value);
                      setSelected(new Set());
                      setEditor(null);
                    }}
                    className={`border-b-2 px-1 pb-3 text-sm font-medium ${
                      tab === value
                        ? "border-[#f54e00] text-[#26251e]"
                        : "border-transparent text-[#807d72]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === "resolved" ? (
              <ResolvedTable
                state={state}
                onSplit={(normalizedName, displayName) =>
                  openEditor("split", [normalizedName], {
                    canonicalName: displayName,
                    reason: "Split this variant into its own canonical brand",
                  })
                }
              />
            ) : (
              <>
                {tab === "review" && state.suggestions.length > 0 ? (
                  <SuggestionStrip
                    state={state}
                    onUse={(suggestion) =>
                      openEditor("merge", [suggestion.sourceNormalizedName], {
                        canonicalName: suggestion.targetBrandName,
                        brandId: suggestion.targetBrandId,
                        reason: "Accepted clustering suggestion after review",
                      })
                    }
                  />
                ) : null}
                <CandidateTable
                  candidates={candidates}
                  selected={selected}
                  onToggle={toggle}
                  onRestore={(candidate) =>
                    openEditor("restore", [candidate.normalizedName], {
                      canonicalName: candidate.rawNames[0],
                      reason: "Reviewed and restored as a real brand",
                    })
                  }
                />
              </>
            )}

            {tab === "review" && selected.size > 0 && !editor ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e6e5e0] bg-white p-4">
                <span className="mr-2 text-sm text-[#5a5852]">
                  {selected.size} selected
                </span>
                <ActionButton
                  icon={<GitMerge className="size-4" />}
                  label="Merge"
                  onClick={() => openEditor("merge", [...selected])}
                />
                <ActionButton
                  icon={<Check className="size-4" />}
                  label="Keep for review"
                  onClick={() => openEditor("needs_review", [...selected])}
                />
                <ActionButton
                  icon={<RotateCcw className="size-4" />}
                  label="Suppress"
                  onClick={() => openEditor("suppress", [...selected])}
                />
              </div>
            ) : null}

            {editor ? (
              <DecisionEditor
                editor={editor}
                brands={state.brands}
                selectedCount={selected.size}
                pending={applyAction.isPending}
                onChange={setEditor}
                onCancel={() => setEditor(null)}
                onSubmit={submitAction}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCards({ state }: { state: ResolutionState }) {
  const cards = [
    ["Canonical brands", state.canonicalBrands.length],
    ["Suppressed", state.summary.suppressed],
    ["Needs review", state.summary.needsReview],
    ["Raw mentions", state.summary.mentionCount],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-[#e6e5e0] bg-white p-5"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#807d72]">
            {label}
          </div>
          <div className="mt-2 text-3xl font-normal tracking-[-0.02em]">
            {value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function CandidateTable({
  candidates,
  selected,
  onToggle,
  onRestore,
}: {
  candidates: Candidate[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onRestore: (candidate: Candidate) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border border-[#e6e5e0] bg-white p-10 text-center text-sm text-[#807d72]">
        Nothing in this queue.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e6e5e0] bg-white">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-[#efeee8] text-xs font-semibold uppercase tracking-[0.08em] text-[#807d72]">
          <tr>
            <th className="w-12 px-4 py-3">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-4 py-3">Candidate</th>
            <th className="px-4 py-3">Mentions</th>
            <th className="px-4 py-3">Decision</th>
            <th className="px-4 py-3">Evidence</th>
            <th className="px-4 py-3">Rule</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efeee8]">
          {candidates.map((candidate) => (
            <tr key={candidate.normalizedName}>
              <td className="px-4 py-4 align-top">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm border-[#cfcdc4]"
                  checked={selected.has(candidate.normalizedName)}
                  onChange={() => onToggle(candidate.normalizedName)}
                  aria-label={`Select ${candidate.rawNames[0]}`}
                />
              </td>
              <td className="px-4 py-4 align-top">
                <div className="font-medium">{candidate.rawNames[0]}</div>
                {candidate.rawNames.length > 1 ? (
                  <div className="mt-1 text-xs text-[#807d72]">
                    Raw variants: {candidate.rawNames.slice(1).join(", ")}
                  </div>
                ) : null}
                <code className="mt-1 block text-xs text-[#a09c92]">
                  {candidate.normalizedName}
                </code>
              </td>
              <td className="px-4 py-4 align-top tabular-nums">
                {candidate.mentionCount.toLocaleString()}
              </td>
              <td className="px-4 py-4 align-top">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stateBadge(candidate.decision.state)}`}
                >
                  {stateLabel(candidate.decision.state)}
                </span>
                <div className="mt-1 text-xs text-[#807d72]">
                  {Math.round(candidate.decision.confidence * 100)}% confidence
                </div>
              </td>
              <td className="max-w-72 px-4 py-4 align-top text-xs text-[#5a5852]">
                {candidate.decision.evidence.length > 0
                  ? candidate.decision.evidence
                      .slice(0, 2)
                      .map((item) => item.value)
                      .join(" · ")
                  : candidate.decision.reason}
              </td>
              <td className="px-4 py-4 align-top">
                <code className="text-xs text-[#807d72]">
                  {candidate.decision.ruleVersion}
                </code>
                <div className="mt-1 text-xs text-[#a09c92]">
                  {candidate.persisted ? candidate.decision.source : "preview"}
                </div>
              </td>
              <td className="px-4 py-4 align-top">
                {candidate.decision.state === "suppressed" ? (
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs font-medium text-[#26251e] hover:bg-[#efeee8]"
                    onClick={() => onRestore(candidate)}
                  >
                    Restore
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResolvedTable({
  state,
  onSplit,
}: {
  state: ResolutionState;
  onSplit: (normalizedName: string, displayName: string) => void;
}) {
  if (state.canonicalBrands.length === 0) {
    return (
      <div className="rounded-xl border border-[#e6e5e0] bg-white p-10 text-center text-sm text-[#807d72]">
        Refresh or review candidates to create canonical brands.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e6e5e0] bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-[#efeee8] text-xs font-semibold uppercase tracking-[0.08em] text-[#807d72]">
          <tr>
            <th className="px-4 py-3">Canonical brand</th>
            <th className="px-4 py-3">Raw variants retained</th>
            <th className="px-4 py-3">Mentions</th>
            <th className="px-4 py-3">Split mapping</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efeee8]">
          {state.canonicalBrands.map((row) => (
            <tr key={row.brand.id}>
              <td className="px-4 py-4 align-top">
                <div className="font-medium">{row.brand.name}</div>
                <div className="mt-1 text-xs text-[#807d72]">
                  {row.brand.domain ?? "No primary domain"}
                </div>
              </td>
              <td className="px-4 py-4 align-top text-[#5a5852]">
                {row.rawNames.join(", ")}
              </td>
              <td className="px-4 py-4 align-top tabular-nums">
                {row.mentionCount.toLocaleString()}
              </td>
              <td className="px-4 py-4 align-top">
                <div className="flex flex-wrap gap-1">
                  {row.normalizedNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-[#e6e5e0] px-2 py-1 text-xs hover:bg-[#efeee8]"
                      onClick={() =>
                        onSplit(
                          name,
                          state.candidates.find(
                            (candidate) => candidate.normalizedName === name,
                          )?.rawNames[0] ?? name,
                        )
                      }
                    >
                      <Split className="size-3" />
                      {name}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuggestionStrip({
  state,
  onUse,
}: {
  state: ResolutionState;
  onUse: (suggestion: ResolutionState["suggestions"][number]) => void;
}) {
  return (
    <section className="rounded-xl border border-[#e6e5e0] bg-white p-5">
      <h2 className="text-base font-semibold">Merge suggestions</h2>
      <p className="mt-1 text-sm text-[#807d72]">
        Suggestions never change a mapping until a reviewer accepts one.
      </p>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {state.suggestions.slice(0, 6).map((suggestion) => (
          <div
            key={suggestion.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[#efeee8] p-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">
                {suggestion.sourceNormalizedName} →{" "}
                <strong>{suggestion.targetBrandName}</strong>
              </div>
              <div className="mt-1 text-xs text-[#807d72]">
                Suggestion only · {Math.round(suggestion.confidence * 100)}%
                confidence
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md border border-[#cfcdc4] px-2.5 py-1.5 text-xs font-medium hover:bg-[#efeee8]"
              onClick={() => onUse(suggestion)}
            >
              Review merge
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function DecisionEditor({
  editor,
  brands,
  selectedCount,
  pending,
  onChange,
  onCancel,
  onSubmit,
}: {
  editor: {
    action: ActionName;
    canonicalName: string;
    brandId?: string;
    reason: string;
  };
  brands: ResolutionState["brands"];
  selectedCount: number;
  pending: boolean;
  onChange: (editor: {
    action: ActionName;
    canonicalName: string;
    brandId?: string;
    reason: string;
  }) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const needsCanonical =
    editor.action === "merge" ||
    editor.action === "split" ||
    editor.action === "restore";
  const valid =
    selectedCount > 0 &&
    editor.reason.trim().length >= 3 &&
    (!needsCanonical || editor.canonicalName.trim().length > 0);
  return (
    <section className="rounded-xl border border-[#cfcdc4] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Confirm {editor.action.replace("_", " ")}
          </h2>
          <p className="mt-1 text-sm text-[#5a5852]">
            This replaces the active mapping for {selectedCount} candidate
            {selectedCount === 1 ? "" : "s"}. Raw mentions and prior rules stay
            intact.
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-[#807d72]"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {needsCanonical ? (
          <>
            <label className="text-sm">
              <span className="mb-1.5 block font-medium">Existing brand</span>
              <select
                className="select w-full rounded-lg border-[#cfcdc4] bg-white"
                value={editor.brandId ?? ""}
                onChange={(event) => {
                  const brand = brands.find(
                    (item) => item.id === event.target.value,
                  );
                  onChange({
                    ...editor,
                    brandId: brand?.id,
                    canonicalName: brand?.name ?? editor.canonicalName,
                  });
                }}
              >
                <option value="">Create or use by name</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block font-medium">Canonical name</span>
              <input
                className="input w-full rounded-lg border-[#cfcdc4] bg-white"
                value={editor.canonicalName}
                onChange={(event) =>
                  onChange({
                    ...editor,
                    canonicalName: event.target.value,
                    brandId: undefined,
                  })
                }
              />
            </label>
          </>
        ) : null}
        <label className="text-sm md:col-span-2">
          <span className="mb-1.5 block font-medium">Review reason</span>
          <textarea
            className="textarea min-h-24 w-full rounded-lg border-[#cfcdc4] bg-white"
            value={editor.reason}
            maxLength={500}
            onChange={(event) =>
              onChange({ ...editor, reason: event.target.value })
            }
            placeholder="What evidence supports this decision?"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#26251e] px-4 text-sm font-medium text-[#f7f7f4] disabled:opacity-40"
          disabled={!valid || pending}
          onClick={onSubmit}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save reversible decision
        </button>
      </div>
    </section>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cfcdc4] px-3 text-sm font-medium hover:bg-[#efeee8]"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
