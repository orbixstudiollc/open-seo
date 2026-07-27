# Phase 1 tracked runs build report

## Shipped

- Project run settings with `weekly` as the default cadence and a default hard
  budget of 200 prompt/model calls per UTC cadence window. `manual` cadence
  disables scheduled dispatch but retains a monthly budget window.
- All four Prompt Explorer answer models are enabled on new sets:
  `chat_gpt`, `claude`, `gemini`, and `perplexity`. A 45-prompt default set
  therefore reserves 180 calls.
- Prompt-set, topic, prompt, and tag management through authenticated server
  functions and MCP tools. The existing read tool now returns settings, run
  status, answers, citations, and actual cost.
- The existing 15-minute cron now dispatches due tracked sets inside its shared
  Postgres scope. It orders and limits due work, advances cadence before
  admission, isolates each set, records visible skip reasons, and prunes
  terminal runs in a bounded pass.
- One admission path for scheduled and manual runs. A conditional
  `UPDATE ... RETURNING` reserves the full project call count atomically before
  Workflow creation. Reservations are not refunded after failures.
- One durable answer placeholder and stable Workflow step per
  `(run, prompt, model)`. A pending-to-running claim occurs before provider
  spend. Workflow replay never repeats a running or terminal tuple.
- Four-at-a-time Workflow batching with `Promise.allSettled`. Successful model
  answers survive isolated failures, and final status distinguishes
  `completed`, `partial`, and `failed`.
- DataForSEO's provider path and USD cost now survive the metering wrapper.
  Hosted runs also persist credits consumed; self-hosted runs persist the same
  provider envelope with zero hosted credits. Run totals come from stored
  answers.
- SQLite migration `drizzle/0038_amazing_grim_reaper.sql` and Postgres migration
  `drizzle-pg/0015_solid_wallow.sql`, committed together.

## Cost-safety review

| Audit hazard                             | Implemented control                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Concurrent balance checks overspend      | One atomic project call reservation; no read-then-write balance gate                                                      |
| Manual and scheduled races               | Both triggers call `beginAiTrackedRun`; one active run per set and one shared project budget                              |
| Spend precedes billing persistence       | Answers store provider cost separately from hosted credits; charged and post-spend failures retain the available envelope |
| Workflow replay repeats paid work        | Stable tuple IDs plus a persisted pending/running/terminal claim; indeterminate attempts fail closed                      |
| Unbounded `allSettled` fan-out           | Batches contain at most four paid tuple steps                                                                             |
| Two mention platforms undercount answers | Admission counts the four enabled answer models                                                                           |
| Call count is mistaken for dollars       | The setting is named `answerCallCap`; UI/API results report actual USD after execution                                    |

Scheduled runs bypass the seven-day Prompt Explorer cache and store
`from_cache=false`. Empty, unpaid, capped, archived, and already-running sets
advance or clear their schedule so cron does not retry them every 15 minutes.

## Verified

- Applied the full 39-migration SQLite history to a fresh persisted local D1
  database.
- Both migration generators reported no remaining schema changes. Schema parity
  and the shared repository contract cover SQLite and Postgres.
- Full test suite: 100 files passed, 823 tests passed, 4 environment-gated tests
  skipped.
- `pnpm run ci:check`: green, including Prettier, Knip, both TypeScript builds,
  and type-aware Oxlint.
- Atomic-race test: concurrent 120-call reservations against a 200-call budget
  admitted one request.
- Oversized-set test: 500 prompts across four models requested 2,000 calls and
  was refused before Workflow or provider work.
- Replay test: a running tuple was made terminal without a second provider
  call.
- Forced-failure test: one successful answer and one charged model failure
  finalized as `partial`, retaining `$0.15` provider cost and 192 hosted
  credits.
- Citation-write failure test: the paid answer and billing envelope remained
  terminal, preventing replay spend.

## Live exit-gate run

On 27 July 2026, a local running Worker received a scheduled event for prompt
set `7e55c630-6d6c-4ef3-ac8c-3e8f374b34e8`. Run
`71b3b3da-e041-4792-a64e-4c1d1ecf5afc` executed unattended:

| Observation                       |      Result |
| --------------------------------- | ----------: |
| Prompts                           |          45 |
| Enabled models                    |           4 |
| Reserved and persisted answers    |         180 |
| Successful / failed answers       |     180 / 0 |
| Distinct completed prompts        |          45 |
| Maximum observed in-flight tuples |           4 |
| DataForSEO provider cost          |   $1.033996 |
| Self-hosted credits consumed      |           0 |
| Run status                        | `completed` |

The scheduler started at `2026-07-27T16:57:27.325Z` and finalized at
`2026-07-27T17:03:09.122Z`. Direct D1 reads during execution observed four
running tuples while the remainder stayed pending. After completion, a manual
run for the same 45×4 set requested another 180 calls and was refused with
`run_cap_reached`; the weekly budget still showed 180 reserved out of 200.

## Exit gate

- [x] A 45-prompt set executes unattended on schedule and writes a full run
- [x] Cost is reported per run
- [x] One model failing does not fail the run
- [x] The run cap holds for scheduled and manual triggers
- [x] `ci:check` is green

## Deferred

Phase 2 owns trend calculations and analytics views. Phase 1 exposes its
management and result surfaces through server functions and MCP; it does not
start Phase 2 work.
