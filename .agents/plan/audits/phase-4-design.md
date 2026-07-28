# Phase 4 sentiment and rank — design

## Outcome and boundary

Phase 4 enriches successful tracked answers at ingest with one observation per
registered brand found in the answer body. Each observation stores a
model-judged sentiment label and the deterministic ordinal of the brand's first
body-text occurrence. The existing answer acquisition remains the paid,
terminal tuple boundary; scoring runs afterward as its own Workflow step and
can never change the answer or parent run from success to failure.

The phase owns mention detection from the active brand registry, mention
sentiment/position fields, a scoring-attempt cost ledger, leaderboard ordering,
UI estimate language, and MCP reads. It does not read citation titles or URLs
as mentions and does not change citation storage, rollups, `safeUrl`, or
`citedSources`.

## Mention and position contract

For each successful answer, the ingester loads the project's active canonical
brands and aliases and matches their literal names against the canonical raw
answer text. Matching is case-insensitive, uses Unicode-aware token guards, and
prefers the longest alias when aliases overlap. All names and aliases resolving
to one brand collapse into one `ai_brand_mentions` row. `raw_name` retains the
first matched surface, `normalized_name` is the canonical normalized brand
name, `mention_count` is the number of non-overlapping occurrences, and
`brand_id` identifies the registry entity. Citation-only matches never enter
this path.

Position is the dense, one-based order in which distinct brands first appear in
the answer body. Repeats and aliases share the brand's first position and do not
create gaps. Markdown list and table order are ordinary character reading
order; an explicit rank column does not override it. The first occurrence start
and end offsets are stored with the observation so the ordinal is inspectable.
If an occurrence cannot be defended, no mention row is created rather than
inventing a position.

## Sentiment and failure semantics

One bounded, non-streaming call scores every detected brand in an answer
together through `chatProvider.ts`. The prompt contains stable brand IDs, names,
the raw answer, and a versioned structured-output contract. The only persisted
labels are `positive`, `neutral`, and `negative`; the scorer returns `null` for
mixed or unclear treatment. Zod rejects unknown IDs, duplicate IDs, missing
brand results, invented labels, and malformed output. A numeric estimate used
for leaderboard aggregation is derived at read time as positive `1`, neutral
`0`, and negative `-1`; it is never persisted as a model measurement.

The answer is already terminal before this call begins. Provider setup errors,
missing custom-provider pricing, outages, invalid output, usage-accounting
errors, and persistence errors are caught inside the scoring step. They leave
the mention rows with `sentiment = null`, their deterministic positions intact,
and an explicit `failed` or `skipped` scoring status. The Workflow continues,
and run finalization depends only on answer tuples.

## Cost and idempotency

`ai_mention_scoring_attempts` is separate from DataForSEO answer cost and chat
agent billing. One versioned attempt per answer records run and answer IDs,
provider kind, model ID, prompt version, status, provider-neutral input/output
tokens, USD cost, `actual | estimated | unknown` cost basis, immutable custom
input/output rate snapshots, sanitized error code, and timestamps.

OpenRouter cost comes from its provider metadata and is stored as `actual`.
Custom providers use standard token counts with explicit
`AI_SCORING_INPUT_USD_PER_MILLION` and
`AI_SCORING_OUTPUT_USD_PER_MILLION` rates, including legitimate zero rates, and
store `estimated`. Missing or invalid custom rates skip the paid call, record
`cost_usd = null` with `unknown` basis, and leave sentiment null. Missing token
usage after a custom call likewise records unknown rather than zero.

The attempt is inserted before the call. A persisted attempt for the same
answer and prompt version makes Workflow replay fail closed without a second
provider call. A later prompt/schema version may create a new attempt; old
attempts and their costs remain durable.

## Persistence and application surfaces

SQLite/D1 migration `0040` and Postgres migration `0017` add mention scoring
fields and the attempt ledger in one commit. Repository methods atomically
insert detected observations, claim an attempt, and apply only a successful
attempt's labels. Run-detail reads include attempts so actual, estimated, and
unknown scoring spend stays separate from answer acquisition spend.

Visibility analytics aggregate sentiment and average position by canonical
brand. The Share of Voice leaderboard accepts `mentions`, `sentiment`, or
`position` ordering with null estimates last and stable name tie-breaking. The
UI labels sentiment as an estimate and exposes the ordering control. The
analytics server function and MCP tool accept the same sort field; run-state MCP
output includes mention evidence, processing status, and bounded scoring
attempts.

## Verification

Golden tests cover clearly positive, negative, and neutral hand-labelled
answers plus mixed/unclear null output. Stored fixtures cover multi-brand
listicle and Markdown-table answers, repeated aliases, overlap, and citation
exclusion. Workflow tests prove the answer is terminal before scoring, scoring
failure cannot fail a run, and replay cannot repeat a call. Repository and
schema-parity tests cover both dialects, ledger cost bases, nullable failure
outcomes, and attempt retention. Analytics/UI/MCP tests prove sorting by
sentiment and position and preserve null semantics. The phase closes only when
both generators report no drift and `pnpm run ci:check` is green.
