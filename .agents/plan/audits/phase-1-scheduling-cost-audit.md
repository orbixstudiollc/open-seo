# Phase 1 — scheduling & cost audit findings (workspace: curitiba)

Produced 27 Jul 2026 by the parallel audit pass (GPT-5.6 Sol via Conductor). Read-only audit; no code was modified.

---

Audit complete. No files were modified; the worktree remains clean.

## Findings

### Scheduled-run structure

- Cloudflare invokes one cron every 15 minutes, configured in [wrangler.jsonc](wrangler.jsonc:61).
- The `scheduled` handler in [src/server.ts](src/server.ts:183) wraps the entire cron dispatch in `withPgClient`. This gives the cron invocation one request-scoped Postgres client; it is a no-op for D1.
- [scheduledRankChecks.ts](src/server/features/rank-tracking/services/scheduledRankChecks.ts:12) selects at most 50 active, due configurations belonging to non-archived projects. It processes them sequentially.
- Each configuration is isolated by its own `try/catch`, so a paid-plan lookup, database error, or workflow-start failure for one configuration does not stop later configurations.
- Empty configurations advance their schedule without starting a run. Non-empty configurations also advance `nextCheckAt` before attempting to create the run, preventing the cron from creating a retry storm.
- `beginRankCheckRun` in [rankCheckRunGuards.ts](src/server/features/rank-tracking/services/rankCheckRunGuards.ts:140) creates a pending database row and uses the run UUID as the Cloudflare Workflow instance ID.
- A partial unique index permits only one pending/running run per configuration. If an active row blocks admission, the guard checks the Workflow instance, marks a genuinely stale row failed, and retries once.
- If Workflow creation fails, the pending row is marked failed and any possible zombie Workflow is terminated.
- The Workflow itself opens a new Postgres scope. Every durable `step.do` that touches the database uses [pgStep.ts](src/server/workflows/pgStep.ts:20), because the outer async-local Postgres scope does not survive Workflow step resumptions.

This structure should be copied for tracked-prompt scheduling: shared cron, due-row query, eager cadence advancement, database-backed admission, Workflow ID equal to run ID, stale reconciliation, and per-step Postgres scoping.

### Failure isolation

There are several distinct boundaries:

- Cron/configuration: each due configuration is caught independently.
- Run admission: the database prevents duplicate active runs; stale Workflow state can be reconciled.
- Workflow: preparation/finalization failures mark the run failed. The paid work is caught separately so already-written partial results can still be finalized.
- Rank-check call: live calls use `Promise.allSettled`, log individual failures, and persist successful snapshots. Queued posting, polling, and fallback similarly preserve completed work.
- Prompt Explorer model: [promptExplorer.ts](src/server/features/ai-search/services/promptExplorer.ts:45) deduplicates selected models and fans them out with `Promise.allSettled`. Ordinary model failures become model-specific `UPSTREAM_ERROR` results while other models succeed.
- Important exception: `INSUFFICIENT_CREDITS` and `AI_SEARCH_BILLING_ISSUE` are rethrown by [mapErrorToResult](src/server/features/ai-search/services/promptExplorer.ts:282). One such result rejects the whole Prompt Explorer request after all model promises have settled. That behavior is appropriate for an interactive account-level error, but a persisted scheduled run should record the account-level condition explicitly rather than losing successful model results.

A tracked run therefore needs run-level status plus one durable answer/status row per prompt/model. “Completed with model failures” must remain distinct from a wholly failed run.

### Cost metering today

- `createDataforseoClient` wraps every paid endpoint, including `llmResponse`, in [client.ts](src/server/lib/dataforseo/client.ts:124).
- In hosted mode, each individual call:
  1. Ensures an Autumn customer exists.
  2. Checks that the combined monthly/top-up balance is greater than zero.
  3. Calls DataForSEO.
  4. Reads actual provider `path` and `cost` from the response billing envelope.
  5. Applies the 1.28 markup and converts USD to credits.
  6. Deducts monthly credits first, then top-up credits.
  7. Emits a `usage:credits_consume` event.

- Charged upstream failures are also metered when DataForSEO supplies billing metadata.
- LLM responses are automatically attributed to `ai_prompt_responses` from their API path.
- Prompt Explorer does not currently receive cost information. The wrapper returns only response data after charging, so neither the service nor a run row can aggregate actual spend.
- In self-hosted mode, the wrapper executes the provider request and discards its billing envelope without Autumn tracking. Consequently, provider cost is known transiently but unavailable for per-run reporting.
- Prompt/model cache hits cost nothing. Successful prompt responses are cached per organization, project, prompt, model and search settings for seven days.

### Why the hard cost cap is harder than it looks

1. **No atomic reservation.** The current gate only checks whether total credits are above zero, not whether they cover the next LLM call. Four concurrent models—or concurrent runs in the same organization—can all observe the same balance and spend beyond it.

2. **No project-level admission primitive.** Rank tracking prevents duplicate runs per configuration, but Phase 1 needs a cap across every prompt set in a project. Manual and scheduled triggers can race unless they share one transactional/constraint-backed admission path.

3. **Metering happens after provider spend.** A provider call can succeed before billing or persistence fails. Autumn `track` has no idempotency key; it deliberately retries only 429 responses to avoid double charging. This leaves an unavoidable distinction between provider cost, successfully deducted credits, and persisted run cost.

4. **Workflow replay can duplicate paid work.** A large fan-out inside one Workflow step is unsafe: if execution completes upstream but the step result is not checkpointed, replay can repeat multiple paid calls. Each prompt/model needs a stable idempotency identity and a narrow durable step or persisted claimed state.

5. **`Promise.allSettled` is isolation, not throttling.** Reusing Prompt Explorer wholesale for 500 prompts × 4 models would launch 2,000 paid requests concurrently and likely exceed Worker subrequest/runtime limits. Runs need bounded batching while preserving per-model settlement.

6. **“Platform” is ambiguous.** `LlmPlatform` is only `chat_gpt | google` for LLM-mentions queries in [shared.ts](src/server/lib/dataforseo/shared.ts:11), but Prompt Explorer exposes four response models in [ai-search.ts](src/types/schemas/ai-search.ts:141). A prompt cap based on two platforms can undercount a four-model response run by 2×.

7. **Call count is not a dollar cap.** Actual DataForSEO cost comes back per task and may vary by model, web search, and output. The unverified pricing noted in the plan prevents turning a prompt count into a reliable monetary ceiling. A hard pre-spend dollar cap requires a conservative reservation price or a separate hard prompt/model-call limit.

8. **Cache semantics need an explicit decision.** Scheduled runs using the existing seven-day cache may store week-old answers at zero cost, while bypassing it makes scheduled data fresh but more expensive. Weekly cadence lies directly on the cache TTL boundary. Runs must record `fromCache`, source timestamp, and zero/actual cost if caching remains enabled.

9. **Eager cadence advancement changes cap behavior.** The existing scheduler advances `nextCheckAt` before admission. A cap refusal would therefore skip the period rather than retry every 15 minutes. That is probably desirable, but it must be deliberate and visible as a skip reason.

10. **Paid-plan skips behave differently.** Existing unpaid configurations do not advance their schedule, so the cron rechecks them every 15 minutes. Extending this unchanged to many prompt sets creates repeated Autumn reads even though it avoids provider spend.

11. **The due-query limit is not a cap.** The existing `LIMIT 50` has no ordering and only bounds one cron invocation. It neither limits per-project cost nor guarantees fair draining when more than 50 sets remain due.

12. **Fallback/account failures can obscure partial value.** Prompt Explorer rethrows account-level billing errors after other models may already have succeeded and been charged. Scheduled persistence must write settled successes before assigning the final run state.

13. **Phase 0 is not present in this checkout.** The current schemas contain no tracked-prompt, AI run, answer, citation, tag, topic, or brand-registry tables. Phase 1 cannot be implemented safely here until Phase 0 lands.

## Phase 1 file surface

Assuming Phase 0 lands its planned persistence tables first, this is the minimum file surface.

Existing files that must change:

- [src/server.ts](src/server.ts:173) — dispatch AI prompt schedules from the existing cron and export the new Workflow.
- [wrangler.jsonc](wrangler.jsonc:22) — add the Workflow binding; keep the existing cron.
- `worker-configuration.d.ts` — regenerate Cloudflare binding types.
- [src/server/features/ai-search/services/promptExplorer.ts](src/server/features/ai-search/services/promptExplorer.ts:45) — expose reusable per-model execution/isolation, caching metadata, and cost observation without changing interactive behavior.
- [src/server/lib/dataforseo/client.ts](src/server/lib/dataforseo/client.ts:137) — carry actual per-call billing data to run accounting while retaining the single billing path.
- [src/server/billing/subscription.ts](src/server/billing/subscription.ts:182) — support safe run-aware gating/reservation or otherwise define atomic cap enforcement.
- [src/types/schemas/ai-search.ts](src/types/schemas/ai-search.ts:136) — prompt-set/topic/tag CRUD, cadence, run, cost, manual-trigger, and status schemas.
- `src/serverFunctions/ai-search.ts` — authenticated CRUD, run-now, status and run-history endpoints.
- `src/server/mcp/server.ts` — register Phase 1 MCP tools as required by the cross-cutting plan.
- Existing Prompt Explorer route/page/form files if tracked-set management is integrated there:
  - `src/routes/_project/p/$projectId/prompt-explorer.tsx`
  - `src/client/features/ai-search/PromptExplorerPage.tsx`
  - `src/client/features/ai-search/components/PromptExplorerForm.tsx`
  - `src/client/features/ai-search/components/PromptExplorerResults.tsx`
- `src/client/navigation/items.ts` and generated route artifacts only if tracked prompts get a separate project route.

New implementation files expected:

- AI visibility repository for prompt sets, prompts, topics, tags, runs, answers and atomic run admission.
- Prompt-set CRUD service.
- Scheduled AI-run dispatcher extending the current cron.
- AI run guards/stale reconciliation equivalent to `rankCheckRunGuards.ts`.
- Cloudflare AI tracking Workflow plus bounded prompt/model execution helpers.
- MCP tool module for listing/managing tracked sets, triggering runs, and reading run status/results.
- Unit tests for cadence, cap races, manual/scheduled parity, stale runs, partial model failures, billing aggregation, cache behavior, and MCP schemas.

Schema/migration files, if Phase 0 does not already contain every required cadence/cap/cost field:

- `src/db/app.schema.ts`
- `src/db/pg/app.schema.ts`
- `src/db/schema.ts`
- `src/db/pg/schema.ts`
- `src/db/schema-parity.test.ts`
- One new D1 migration plus its `drizzle/meta` snapshot/journal update.
- One new Postgres migration plus its `drizzle-pg/meta` snapshot/journal update.

`alchemy.run.ts` should not require a manual change: it already provisions every Workflow declared in `wrangler.jsonc`.
