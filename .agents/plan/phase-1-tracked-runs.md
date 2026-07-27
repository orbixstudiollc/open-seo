# Phase 1 — Tracked prompt sets & scheduled runs

**Blocks:** 2–7. **Effort:** 2–3 weeks. **Depends on:** Phase 0 gate passed.

## Why this exists

Turns one-shot lookups into a monitored set. This is the phase that makes OpenSEO
a tracker rather than a search box — and it is where the recurring cost of the
whole feature gets decided.

## 1. Audit first

- Trace `runScheduledRankChecks` end to end: the cron entry in `src/server.ts`
  (~line 183), how it scopes a Postgres client per run, how it isolates failures.
  **Copy this wholesale. Do not invent a second scheduling mechanism.**
- Read `promptExplorer.ts` — its `Promise.allSettled` fan-out already handles
  per-model failure isolation correctly. Reuse it.
- Read `src/server/billing/subscription` for the existing metering path.
- Note: `LlmPlatform` is currently `"chat_gpt" | "google"` — two platforms, not six.

## 2. Build

- CRUD for prompts, topics, tags.
- Scheduled runner extending the existing cron.
- Per-run cost metering through the current billing path.
- Run status, with per-model failure isolation.
- **Cadence control and a hard per-project run cap.** Default cadence to weekly.

## 3. Review

Adversarial cost review specifically:

- What happens on retry storms?
- What happens to a stuck or partially-written run?
- What does a project with 500 prompts cost?
- Can the cap be bypassed by a manual "run now"?

## 4. Test

- Unit tests for cadence and cap logic.
- A live scheduled run observed end to end against the running instance, with
  real cost reported.
- A deliberately failing model verified **not** to fail the whole run.

## 5. Exit gate

- [ ] A 45-prompt set executes unattended on schedule and writes a full run
- [ ] Cost is reported per run
- [ ] One model failing does not fail the run
- [ ] The run cap demonstrably holds, including against manual triggers
- [ ] `ci:check` green

## Known risk — highest in the plan

Volume is `prompts × platforms × frequency` and compounds silently.

| Configuration | Calls/run | Monthly |
|---|---|---|
| 45 prompts × 2 platforms, weekly | 90 | ~390 |
| 45 prompts × 2 platforms, daily | 90 | ~2,700 |
| 45 prompts × 6 platforms, daily | 270 | ~8,100 |

**Confirm current DataForSEO per-call LLM pricing before setting a default.** The
figure drives the budget and has not been verified. Ship cadence control and the
cap in *this* phase, not later.
