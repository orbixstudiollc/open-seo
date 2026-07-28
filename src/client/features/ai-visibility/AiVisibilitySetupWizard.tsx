/* eslint-disable max-lines -- the five-step route-owned wizard keeps its small step panels colocated. */
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  completeAiVisibilitySetup,
  type getAiVisibilitySetupState,
} from "@/serverFunctions/ai-visibility-setup";
import { runAiPromptSetNow } from "@/serverFunctions/ai-search";
import { AI_TRACKED_RUN_MAX_CALL_CAP } from "@/shared/ai-visibility";

type SetupState = Awaited<ReturnType<typeof getAiVisibilitySetupState>>;
type TopicDraft = { id: string; name: string; prompts: string[] };
type CompetitorDraft = { id: string; name: string; domain: string };

const STEPS = ["Your brand", "Competitors", "Prompts", "Call budget", "Finish"];
const MODELS = ["chat_gpt", "claude", "gemini", "perplexity"] as const;

export function AiVisibilitySetupWizard({
  projectId,
  setupState,
  onComplete,
}: {
  projectId: string;
  setupState: SetupState;
  onComplete: (state: SetupState) => void;
}) {
  const existingSet = setupState.promptSets[0];
  const [step, setStep] = useState(0);
  const [primaryName, setPrimaryName] = useState(
    setupState.primaryBrand?.name ?? "",
  );
  const [primaryDomain, setPrimaryDomain] = useState(
    setupState.primaryBrand?.domain ?? "",
  );
  const [competitors, setCompetitors] = useState<CompetitorDraft[]>(() =>
    setupState.competitors.map((brand) => ({
      id: brand.id,
      name: brand.name,
      domain: brand.domain ?? "",
    })),
  );
  const [promptSetName, setPromptSetName] = useState(
    existingSet?.promptSet.name ?? "Core visibility",
  );
  const [topics, setTopics] = useState<TopicDraft[]>(() => {
    if (!existingSet) return [];
    return existingSet.topics
      .filter((topic) => !topic.archivedAt)
      .map((topic) => ({
        id: topic.id,
        name: topic.name,
        prompts: existingSet.prompts
          .filter(
            (prompt) =>
              prompt.topicId === topic.id &&
              prompt.state === "active" &&
              !prompt.archivedAt,
          )
          .map((prompt) => prompt.prompt),
      }))
      .filter((topic) => topic.prompts.length > 0);
  });
  const [answerCallCap, setAnswerCallCap] = useState(
    setupState.settings.answerCallCap,
  );
  const promptCount = topics.reduce(
    (count, topic) =>
      count + topic.prompts.filter((prompt) => prompt.trim()).length,
    0,
  );
  const estimatedCalls = promptCount * MODELS.length;
  const overCap = estimatedCalls > answerCallCap;

  const completion = useMutation({
    mutationFn: async (runNow: boolean) => {
      const result = await completeAiVisibilitySetup({
        data: {
          projectId,
          primary: { name: primaryName, domain: primaryDomain },
          competitors: competitors
            .filter((brand) => brand.name.trim())
            .map((brand) => ({
              name: brand.name,
              domain: brand.domain.trim() || undefined,
            })),
          promptSet: {
            name: promptSetName,
            models: [...MODELS],
            topics: topics
              .filter((topic) => topic.name.trim())
              .map((topic) => ({
                name: topic.name,
                prompts: [
                  ...new Set(
                    topic.prompts
                      .map((prompt) => prompt.trim())
                      .filter(Boolean),
                  ),
                ],
              }))
              .filter((topic) => topic.prompts.length > 0),
          },
          answerCallCap,
        },
      });
      if (runNow) {
        try {
          const run = await runAiPromptSetNow({
            data: { projectId, promptSetId: result.promptSetId },
          });
          if (run.ok) toast.success("AI visibility run started");
          else
            toast.error(
              `Configuration saved; run not started (${run.reason}).`,
            );
        } catch (error) {
          toast.error(
            getStandardErrorMessage(
              error,
              "Configuration saved, but the run couldn't start.",
            ),
          );
        }
      } else {
        toast.success("AI visibility will run weekly");
      }
      return result;
    },
    onSuccess: (result) => onComplete(result.state),
  });

  const canContinue =
    step === 0
      ? primaryName.trim().length > 0 && primaryDomain.trim().length > 0
      : step === 1
        ? competitors.every(
            (competitor) =>
              competitor.name.trim().length > 0 ||
              competitor.domain.trim().length === 0,
          )
        : step === 2
          ? promptSetName.trim().length > 0 &&
            topics.some(
              (topic) =>
                topic.name.trim() &&
                topic.prompts.some((prompt) => prompt.trim()),
            )
          : step === 3
            ? estimatedCalls > 0 && !overCap
            : true;

  return (
    <div className="ai-visibility-page min-h-full overflow-auto px-4 py-6 pb-24 sm:px-6 lg:py-8">
      <main className="mx-auto max-w-4xl">
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
            First-run setup
          </p>
          <h1 className="ai-visibility-display mt-2 text-[30px] leading-tight sm:text-4xl">
            Start tracking AI visibility
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--app-body)]">
            Define the brands and questions that matter, then review the exact
            number of answer calls before anything runs.
          </p>
        </header>

        <ol className="mb-4 grid grid-cols-5 gap-1" aria-label="Setup progress">
          {STEPS.map((label, index) => (
            <li key={label} className="min-w-0">
              <div
                className={`h-1 rounded-full ${
                  index <= step
                    ? "bg-[var(--app-ink)]"
                    : "bg-[var(--app-hairline)]"
                }`}
              />
              <span className="mt-2 hidden truncate text-[11px] text-[var(--app-muted)] sm:block">
                {index + 1}. {label}
              </span>
            </li>
          ))}
        </ol>

        <section className="ai-visibility-card p-5 sm:p-7">
          {step === 0 ? (
            <BrandStep
              name={primaryName}
              domain={primaryDomain}
              onNameChange={setPrimaryName}
              onDomainChange={setPrimaryDomain}
            />
          ) : null}
          {step === 1 ? (
            <CompetitorStep
              competitors={competitors}
              onChange={setCompetitors}
            />
          ) : null}
          {step === 2 ? (
            <PromptStep
              promptSetName={promptSetName}
              topics={topics}
              onPromptSetNameChange={setPromptSetName}
              onTopicsChange={setTopics}
              onRestoreStarters={() =>
                setTopics(starterTopics(primaryName, competitors))
              }
            />
          ) : null}
          {step === 3 ? (
            <BudgetStep
              promptCount={promptCount}
              estimatedCalls={estimatedCalls}
              answerCallCap={answerCallCap}
              overCap={overCap}
              onCapChange={setAnswerCallCap}
            />
          ) : null}
          {step === 4 ? (
            <FinishStep
              estimatedCalls={estimatedCalls}
              pending={completion.isPending}
              onFinish={(runNow) => completion.mutate(runNow)}
            />
          ) : null}

          {completion.isError ? (
            <p
              role="alert"
              className="mt-5 rounded-lg border border-[var(--app-negative)]/30 bg-[var(--app-negative-soft)] p-3 text-sm text-[var(--app-negative)]"
            >
              {getStandardErrorMessage(
                completion.error,
                "Couldn't complete AI visibility setup.",
              )}
            </p>
          ) : null}

          {step < 4 ? (
            <div className="mt-7 flex items-center justify-between border-t border-[var(--app-hairline)] pt-5">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--app-body)] disabled:opacity-40"
                disabled={step === 0}
                onClick={() => setStep((current) => current - 1)}
              >
                <ArrowLeft className="size-4" />
                Back
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 text-sm font-medium text-[var(--app-on-primary)] disabled:opacity-40"
                disabled={!canContinue}
                onClick={() => {
                  if (step === 1 && topics.length === 0) {
                    setTopics(starterTopics(primaryName, competitors));
                  }
                  setStep((current) => current + 1);
                }}
              >
                Continue
                <ArrowRight className="size-4" />
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function BrandStep(props: {
  name: string;
  domain: string;
  onNameChange: (value: string) => void;
  onDomainChange: (value: string) => void;
}) {
  return (
    <StepCopy
      title="Set your primary brand"
      body="This is the brand whose mentions and share of voice the dashboard will measure."
    >
      <Field label="Brand name">
        <input
          className="input w-full"
          value={props.name}
          placeholder="Acme"
          onChange={(event) => props.onNameChange(event.target.value)}
        />
      </Field>
      <Field label="Primary domain">
        <input
          className="input w-full"
          value={props.domain}
          placeholder="acme.com"
          onChange={(event) => props.onDomainChange(event.target.value)}
        />
      </Field>
    </StepCopy>
  );
}

function CompetitorStep({
  competitors,
  onChange,
}: {
  competitors: CompetitorDraft[];
  onChange: (value: CompetitorDraft[]) => void;
}) {
  return (
    <StepCopy
      title="Add competitors"
      body="Competitors make share-of-voice comparisons useful. You can skip this step or add up to five."
    >
      <div className="space-y-3">
        {competitors.map((competitor, index) => (
          <div
            key={competitor.id}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input
              aria-label={`Competitor ${index + 1} name`}
              className="input w-full"
              value={competitor.name}
              placeholder="Competitor name"
              onChange={(event) =>
                onChange(
                  competitors.map((item) =>
                    item.id === competitor.id
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <input
              aria-label={`Competitor ${index + 1} domain`}
              className="input w-full"
              value={competitor.domain}
              placeholder="competitor.com (optional)"
              onChange={(event) =>
                onChange(
                  competitors.map((item) =>
                    item.id === competitor.id
                      ? { ...item, domain: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <IconButton
              label={`Remove competitor ${index + 1}`}
              onClick={() =>
                onChange(
                  competitors.filter((item) => item.id !== competitor.id),
                )
              }
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--app-hairline-strong)] px-3 text-sm font-medium disabled:opacity-40"
        disabled={competitors.length >= 5}
        onClick={() =>
          onChange([
            ...competitors,
            { id: crypto.randomUUID(), name: "", domain: "" },
          ])
        }
      >
        <Plus className="size-4" />
        Add competitor
      </button>
    </StepCopy>
  );
}

function PromptStep({
  promptSetName,
  topics,
  onPromptSetNameChange,
  onTopicsChange,
  onRestoreStarters,
}: {
  promptSetName: string;
  topics: TopicDraft[];
  onPromptSetNameChange: (value: string) => void;
  onTopicsChange: (value: TopicDraft[]) => void;
  onRestoreStarters: () => void;
}) {
  const updateTopic = (id: string, value: TopicDraft) =>
    onTopicsChange(topics.map((topic) => (topic.id === id ? value : topic)));
  return (
    <StepCopy
      title="Create a prompt set"
      body="Start from the templates, then edit or add the exact questions your buyers ask."
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Prompt set name">
          <input
            className="input w-full sm:w-72"
            value={promptSetName}
            onChange={(event) => onPromptSetNameChange(event.target.value)}
          />
        </Field>
        <button
          type="button"
          className="h-10 rounded-lg border border-[var(--app-hairline-strong)] px-3 text-sm font-medium"
          onClick={onRestoreStarters}
        >
          Use starter templates
        </button>
      </div>
      <div className="mt-5 space-y-3">
        {topics.map((topic, topicIndex) => (
          <div
            key={topic.id}
            className="rounded-xl border border-[var(--app-hairline)] bg-[var(--app-canvas-soft)] p-4"
          >
            <div className="flex gap-2">
              <input
                aria-label={`Topic ${topicIndex + 1} name`}
                className="input w-full"
                value={topic.name}
                placeholder="Topic name"
                onChange={(event) =>
                  updateTopic(topic.id, { ...topic, name: event.target.value })
                }
              />
              <IconButton
                label={`Remove topic ${topicIndex + 1}`}
                onClick={() =>
                  onTopicsChange(topics.filter((item) => item.id !== topic.id))
                }
              />
            </div>
            <div className="mt-3 space-y-2">
              {topic.prompts.map((prompt, promptIndex) => (
                <div key={`${topic.id}-${promptIndex}`} className="flex gap-2">
                  <textarea
                    aria-label={`${topic.name || `Topic ${topicIndex + 1}`} prompt ${promptIndex + 1}`}
                    className="textarea min-h-20 w-full"
                    value={prompt}
                    placeholder="Enter a question to track"
                    onChange={(event) =>
                      updateTopic(topic.id, {
                        ...topic,
                        prompts: topic.prompts.map((item, index) =>
                          index === promptIndex ? event.target.value : item,
                        ),
                      })
                    }
                  />
                  <IconButton
                    label={`Remove prompt ${promptIndex + 1}`}
                    onClick={() =>
                      updateTopic(topic.id, {
                        ...topic,
                        prompts: topic.prompts.filter(
                          (_, index) => index !== promptIndex,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium"
              onClick={() =>
                updateTopic(topic.id, {
                  ...topic,
                  prompts: [...topic.prompts, ""],
                })
              }
            >
              <Plus className="size-4" />
              Add free-text prompt
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--app-hairline-strong)] px-3 text-sm font-medium"
        onClick={() =>
          onTopicsChange([
            ...topics,
            { id: crypto.randomUUID(), name: "", prompts: [""] },
          ])
        }
      >
        <Plus className="size-4" />
        Add topic
      </button>
    </StepCopy>
  );
}

function BudgetStep(props: {
  promptCount: number;
  estimatedCalls: number;
  answerCallCap: number;
  overCap: boolean;
  onCapChange: (value: number) => void;
}) {
  return (
    <StepCopy
      title="Review the answer-call cost"
      body="Suggestions are free. Tracked runs call four answer models for every active prompt and the hard cap is enforced before a run starts."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Prompts" value={props.promptCount} />
        <Metric label="Models" value={MODELS.length} />
        <Metric label="Estimated calls" value={props.estimatedCalls} />
      </div>
      <Field label="Weekly answer-call cap">
        <input
          type="number"
          min={1}
          max={AI_TRACKED_RUN_MAX_CALL_CAP}
          className="input w-40"
          value={props.answerCallCap}
          onChange={(event) =>
            props.onCapChange(Number.parseInt(event.target.value, 10) || 1)
          }
        />
      </Field>
      <p
        className={`mt-3 text-sm ${
          props.overCap
            ? "text-[var(--app-negative)]"
            : "text-[var(--app-positive)]"
        }`}
      >
        {props.overCap
          ? `${props.estimatedCalls - props.answerCallCap} calls over the cap. Raise the cap or remove prompts.`
          : `${props.answerCallCap - props.estimatedCalls} calls remain in the first weekly window.`}
      </p>
    </StepCopy>
  );
}

function FinishStep({
  estimatedCalls,
  pending,
  onFinish,
}: {
  estimatedCalls: number;
  pending: boolean;
  onFinish: (runNow: boolean) => void;
}) {
  return (
    <StepCopy
      title="Choose when to start"
      body="Weekly tracking is the default. Running now also keeps the weekly schedule and uses the same hard call cap."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FinishChoice
          title="Keep weekly"
          body="Save the configuration and wait for the scheduled run."
          pending={pending}
          onClick={() => onFinish(false)}
        />
        <FinishChoice
          title="Save and run now"
          body={`Start the full set now. This reserves ${estimatedCalls} answer calls.`}
          primary
          pending={pending}
          onClick={() => onFinish(true)}
        />
      </div>
    </StepCopy>
  );
}

function FinishChoice(props: {
  title: string;
  body: string;
  primary?: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-xl border p-5 text-left ${
        props.primary
          ? "border-[var(--app-primary)] bg-[var(--app-primary)] text-[var(--app-on-primary)]"
          : "border-[var(--app-hairline-strong)] bg-[var(--app-surface)]"
      }`}
      disabled={props.pending}
      onClick={props.onClick}
    >
      <span className="flex items-center gap-2 text-base font-semibold">
        {props.pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
        {props.title}
      </span>
      <span className="mt-2 block text-sm opacity-80">{props.body}</span>
    </button>
  );
}

function StepCopy({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h2 className="ai-visibility-display text-2xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--app-body)]">{body}</p>
      <div className="mt-6 space-y-4">{children}</div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--app-hairline)] bg-[var(--app-canvas-soft)] p-4">
      <p className="text-xs uppercase tracking-[0.08em] text-[var(--app-muted)]">
        {label}
      </p>
      <p className="ai-visibility-display mt-2 text-3xl tabular-nums">
        {value}
      </p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--app-hairline-strong)] text-[var(--app-muted)]"
      onClick={onClick}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function starterTopics(
  primaryName: string,
  competitors: CompetitorDraft[],
): TopicDraft[] {
  const brand = primaryName.trim() || "your brand";
  const competitorNames = competitors
    .map((competitor) => competitor.name.trim())
    .filter(Boolean);
  const comparisonTarget =
    competitorNames.length > 0 ? competitorNames.join(" and ") : "alternatives";
  return [
    {
      id: crypto.randomUUID(),
      name: "Brand discovery",
      prompts: [
        `What is ${brand} best known for?`,
        `Who should consider ${brand}?`,
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Comparisons",
      prompts: [
        `How does ${brand} compare with ${comparisonTarget}?`,
        `What are the best alternatives to ${brand}?`,
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Buying criteria",
      prompts: [
        `What should buyers consider when choosing a solution like ${brand}?`,
        `Which solution is best for teams evaluating ${brand}?`,
      ],
    },
  ];
}
