# Phase 4 sentiment and rank — build report

## Shipped

- Ingest-time answer-body mention detection against project brand names and
  aliases. Matches retain exact character offsets, exclude URL ranges, resolve
  overlapping aliases longest-first, collapse to one answer-brand observation,
  and assign dense positions from each brand's first occurrence.
- A separate scoring phase in `AiTrackedRunWorkflow`, after every answer tuple
  is terminal. It scores all detected brands for one answer in one bounded call
  through the shared chat-provider abstraction.
- Strict sentiment output validation. The scorer may return only the supplied
  stable mention IDs and `positive`, `neutral`, or `negative`; malformed,
  missing, duplicate, or unknown results fail closed to null.
- Non-blocking failure handling. Detection, provider, validation, persistence,
  and billing failures are contained per answer and cannot change a terminal
  answer or fail run finalization.
- An idempotent scoring-attempt ledger in D1/SQLite and Postgres with provider,
  model, prompt version, status, token usage, cost, cost basis, pricing
  snapshot, sanitized error, and timestamps. Workflow replay does not repeat a
  successful paid call.
- Separate scoring-cost accounting: OpenRouter actual cost when supplied,
  operator-priced custom-provider estimates from standard token usage, and
  null/`unknown` when cost cannot be established. A custom provider without an
  explicit pricing policy is skipped before any scheduled scoring call.
- Mention-level scoring provenance and state: sentiment, position, occurrence
  offsets, processing status, scoring attempt, and scoring timestamp.
- Leaderboard analytics and UI sorting by mentions, sentiment estimate, or
  average position, with null values sorted last and explicit estimate
  language.
- MCP exposure for both leaderboard sort modes and per-run scoring-attempt
  state.

## Exit gate

- [x] **Every stored mention carries sentiment and position.** Successfully
      scored mentions persist a validated sentiment and deterministic ordinal
      position with attempt provenance. When scoring is unavailable or invalid,
      sentiment remains null with an explicit failed/skipped state rather than
      a fabricated number; deterministic position remains attached to the
      answer-body observation.
- [x] **The leaderboard sorts by either.** Analytics, server-function input,
      MCP input, and the project UI support sentiment and average-position
      sorting. Headless Chromium verified both controls, values, and ordering.
- [x] **Scoring failure never blocks a run.** Workflow tests cover provider
      rejection and scoring-phase exceptions; answers remain terminal and run
      finalization proceeds.
- [x] **Scoring cost is tracked.** Every attempted or policy-skipped scoring
      operation has a durable ledger record. Actual, estimated, and unknown
      costs remain distinguishable; absent metadata is never converted to
      numeric zero.
- [x] **`ci:check` green.** Passed on 28 Jul 2026 after the final implementation.

## Verification

- Golden sentiment set: hand-labelled positive, negative, and neutral mentions
  pass strict scorer parsing and persistence tests.
- Position fixtures: listicle and Markdown-table answers produce the expected
  first-distinct-brand ordinals, including repeated aliases and canonical
  deduplication.
- Focused Phase 4 and regression run: 233 assertions passed across 11 files;
  four environment-gated tests skipped.
- Full suite: 109 files passed; 877 tests passed; four environment-gated tests
  skipped.
- Schema parity: 184 assertions passed across both dialects.
- SQLite/D1: the complete 41-migration history through
  `0040_natural_frog_thor.sql` applied to a fresh database. The live schema
  inspection confirmed the scoring ledger, mention columns, indexes, and
  nullable attempt foreign key.
- Postgres: `0017_superb_hemingway.sql` and its snapshot were generated from the
  matching schema. No Postgres URL was supplied for the optional live
  integration run.
- `db:generate:d1` and `db:generate:pg`: no schema drift remaining.
- Production Vite client and SSR build: passed.
- Headless Chromium: the AI Visibility leaderboard rendered all three sort
  choices; sentiment and position sorts produced the expected brand order and
  displayed `Sentiment estimate +1.0` and `Avg. position #1`.
- Final `pnpm run ci:check`: green.

## Scope and safety notes

- Scoring reads only the canonical raw answer text. Citation titles, URLs, and
  source rows cannot create a mention, sentiment, or position.
- Citation rollups, `safeUrl`, and `citedSources` were not changed.
- Phase 5 and Phase 6 were not started.

## Checkpoints

- `6ecaa0e` — Phase 4 design note
- `122d701` — dual-dialect mention-scoring schema and cost ledger
- `75c3634` — ingest scoring, analytics, UI, MCP, and tests
