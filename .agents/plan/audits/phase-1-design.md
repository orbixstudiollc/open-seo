# Phase 1 tracked runs — design

## Product defaults and cost boundary

Cadence is one project setting, defaulting to `weekly`; prompt sets keep their
own `next_run_at` only so the shared cron can drain them fairly. New sets enable
all four answer models (`chat_gpt`, `claude`, `gemini`, `perplexity`) by
default. DataForSEO currently prices a Live LLM Response as **$0.0006 plus the
selected LLM's token and feature charges** ([pricing](https://dataforseo.com/pricing/ai-optimization/llm-responses),
[calculation](https://dataforseo.com/help-center/how-the-price-for-using-llm-responses-endpoints-is-calculated)).
The variable component means a call count is not presented as a dollar quote.

| Default model scope    | Calls/run |   Calls/month |           DataForSEO base fee only |
| ---------------------- | --------: | ------------: | ---------------------------------: |
| 1 prompt × 4 models    |         4 |    ~17 weekly |                        $0.0024/run |
| 45 prompts × 4 models  |       180 |   ~780 weekly |           $0.108/run; ~$0.47/month |
| 500 prompts × 4 models |     2,000 | ~8,700 weekly | $1.20/run; rejected by default cap |

The hard cap is therefore a project-wide **prompt/model-call budget per cadence
window**, default 200. Daily, weekly, and monthly projects reset on UTC calendar
boundaries; `manual` cadence disables scheduling but uses a monthly budget
window so “run now” cannot bypass the cap. Every tracked run bypasses the
seven-day Prompt Explorer cache: observations are fresh, `from_cache=false`,
and their actual cost is persisted. The existing interactive cache is
unchanged.

## Persistence and admission

Add one normalized `ai_project_run_settings` row per project with cadence,
`answer_call_cap`, current window start, and calls reserved. Admission first
creates the row if absent, then performs one conditional `UPDATE ... RETURNING`
that resets an expired window or increments `calls_reserved` only when the
entire run fits. This row update is the atomic serialization point on both D1
and Postgres. Scheduled and manual entry points call the same admission service;
the run stores its reservation size/window. Reservations are not refunded
inside a window, including for provider failures or abandoned workflows, so a
retry storm cannot reopen paid capacity.

Phase 0's prompt-set cadence column remains for migration compatibility but is
not read by Phase 1. Prompt sets gain a visible last-skip reason. Answers gain
pending/running execution states, `from_cache`, and consumed-credit detail.
Provider cost remains separate from hosted credits because provider spend can
succeed while Autumn tracking fails. Both dialect schemas and generated
migrations land together.

Admission first claims the prompt set's active-run slot with a pending row, then
reserves the project budget before creating a Workflow whose ID equals the run
ID. A capped attempt becomes a terminal failed row without provider work. A
project can reserve multiple small runs in one window, but their sum cannot
exceed the project cap; the existing partial unique index still allows only one
active run per prompt set. Workflow-start failure marks the run failed. Stale
active rows are reconciled exactly like rank tracking.

## Execution, replay safety, and metering

Preparation snapshots active prompt text and enabled models into one durable
answer placeholder per `(run, prompt, model)`. Each tuple has a stable answer ID
and Workflow step name. A conditional pending→running claim occurs before the
paid request. A replay finding running or terminal state never calls the
provider again; an indeterminate running attempt becomes a durable error rather
than risking duplicate spend. Results and charged failures persist their
DataForSEO billing envelope before finalization.

The DataForSEO wrapper exposes a detailed LLM-response method while retaining
the existing single hosted billing path. It returns provider path/cost and
hosted credits consumed; self-hosted mode returns the same provider envelope
with zero hosted credits. Run totals are recomputed from durable answers, not
in-memory counters.

Fan-out is bounded to four tuple steps at a time. Each batch uses
`Promise.allSettled`, preserving Prompt Explorer's per-model isolation without
launching hundreds of subrequests. A run with some successes and some errors is
`partial`; only zero successful answers is `failed`.

## Scheduling and surfaces

The existing 15-minute `scheduled` handler keeps one `withPgClient` scope and
dispatches rank checks, then due AI prompt sets. The AI due query is ordered and
limited. Each set is isolated by `try/catch`; its schedule advances before
admission. Empty, unpaid, capped, archived, and already-active skips are stored
and do not retry every 15 minutes. Retention pruning runs in a bounded pass.

Authenticated server functions follow server function → service → repository
for project settings; prompt-set, prompt, topic, and tag CRUD; run-now; and run
history. MCP receives matching management/run tools while the existing
read-only state tool remains the results surface.

Tests cover UTC cadence windows, atomic cap races and manual/scheduled parity,
45×4 admission, 500×4 refusal, eager schedule advancement, stale reconciliation,
tuple replay idempotency, bounded concurrency, one-model failure, provider and
self-hosted cost aggregation, dual-dialect repository behavior, schemas, and
MCP authorization. Final verification is the full suite plus `ci:check` and a
running-instance 45-prompt synthetic/live-capability exercise; no Phase 2
analytics are included.
