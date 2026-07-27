# Phase 4 — sentiment and rank audit findings (workspace: san-juan)

Produced 27 Jul 2026. This was the Audit step only. No application code,
schema, migration, or test was changed; this findings note is the only new
file.

---

## Executive finding

Phase 4 should score one stored answer at a time, with the answer's full raw
text and every candidate mention supplied together. Sentiment can then be
returned per mention and position can be validated as one answer-level ordering
of distinct resolved brands.

The scoring call needs a ledger separate from answer acquisition and from the
existing chat-agent meter. The custom-provider path has no portable actual-USD
cost field. Treating missing OpenRouter metadata as `$0` would make scoring look
free, so a custom deployment needs an explicit pricing snapshot used with the
AI SDK's standard token counts. Missing usage or pricing must remain
`unknown`, never numeric zero.

Phase 0's proposed `ai_answers` and `ai_brand_mentions` split is suitable, but
the mention cardinality and position contract must be settled before Phase 4 is
built.

## What the custom-provider path drops

[`resolveChatProviderSync`](../../../src/server/lib/chatProvider.ts#L38)
selects a custom provider whenever `AI_BASE_URL` is set and requires
`AI_API_KEY` plus `AI_MODEL`. The hosted OpenRouter and custom branches both
construct an AI SDK `LanguageModelV3`, but their request options differ:

- The OpenRouter branch in
  [`buildChatAgentModel`](../../../src/server/lib/chatProvider.ts#L99) sends
  `usage: { include: true }`, medium reasoning, a provider preference, ZDR, and
  fallback settings.
- The custom branch sends only the API key, base URL, and model ID. This is
  deliberate because those request extensions are not portable to a strict
  OpenAI-compatible gateway.
- The practical accounting loss is the OpenRouter-specific
  `providerMetadata.openrouter.usage.cost` value. The custom provider may still
  return standard prompt/completion token counts, but it is not required to
  return OpenRouter's actual-USD metadata.
- [`openRouterCostUsd`](../../../src/server/lib/chatAgent.ts#L11) collapses
  absent or malformed provider metadata to `0`. That is tolerable only where
  zero means "do not bill this hosted OpenRouter turn." It cannot be reused as
  Phase 4 telemetry because it conflates an unknown custom-provider cost with a
  genuinely free call.
- [`trackUsageCreditSpend`](../../../src/server/billing/subscription.ts#L202)
  returns without emitting a usage event when the rounded charge is zero.
  Passing the custom path's synthetic `0` would therefore erase the scoring
  call from billing and cost analytics.

There is a documentation-version nuance. OpenRouter's current
[usage-accounting documentation](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
says full usage is now returned automatically and `usage.include` is
deprecated, while the installed OpenRouter AI SDK's documented interface still
exposes cost through
[`providerMetadata.openrouter.usage`](https://github.com/OpenRouterTeam/ai-sdk-provider#usage-accounting).
That does not change the local conclusion: a custom OpenAI-compatible base URL
does not promise OpenRouter's cost metadata.

## Required scoring-cost path

Do not run Phase 4 through `openRouterCostUsd` plus the chat-agent
`onFinish`/`onStepFinish` code. Give the scorer its own non-streaming execution
wrapper and durable attempt record.

Recommended accounting contract:

1. Persist the acquired answer and raw mentions before scoring.
2. Make one bounded scorer call per answer, carrying all mention candidates.
   This avoids paying once per mention and lets the scorer compare brands in
   the same answer.
3. Record every attempt, including retries and paid failures, with at least:
   answer/run ID, provider kind, model ID, scoring prompt/schema version,
   status, input tokens, output tokens, provider cost in USD, cost basis,
   start/completion timestamps, and a sanitized error code.
4. Use `cost_basis = actual` when OpenRouter supplies its usage cost.
5. On a custom provider, use the AI SDK's standard `inputTokens` and
   `outputTokens` with operator-configured input/output rates captured as an
   immutable pricing snapshot for the attempt. The AI SDK exposes these
   provider-neutral counts on generated results in its
   [`LanguageModelUsage`](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#totalusage)
   result.
6. If a custom provider omits token usage or no rate is configured, persist
   `cost_usd = null` and `cost_basis = unknown`. Do not substitute zero.
   Automatic scheduled scoring should require an explicit custom-provider
   pricing policy—rates may legitimately be configured as zero for local
   inference—before Phase 4 can claim that its cost gate passes.
7. Attribute hosted credit consumption to a scoring-specific credit feature,
   not `agent` and not the DataForSEO answer-acquisition feature. The run may
   expose a total, but acquisition cost and scoring cost must remain separately
   inspectable.

This is separate from Phase 1's unresolved DataForSEO seam. The current
[`meterDataforseoCall`](../../../src/server/lib/dataforseo/client.ts#L137)
receives actual provider billing, charges it in hosted mode, and then returns
only the response data. Prompt Explorer cannot currently attach that acquisition
cost to a run. Phase 1 must preserve that acquisition cost; Phase 4 must add
scoring cost rather than overwrite or double-count it.

Billing, provider spend, and persisted run telemetry are three distinct
outcomes. A scoring result must remain saved if the post-call billing event
fails, and an answer must remain saved if scoring or its pre-call credit gate
fails. A scorer outage, invalid structured result, missing pricing, or exhausted
credits should leave sentiment/position null with a processing status; none may
roll back the answer or fail the whole tracked run.

## Where raw answers and mentions come from

Phase 0 is still a proposal in this checkout. Its audit recommends:

- `ai_answers`, unique by run × tracked prompt × model, containing the raw
  answer text, cache key, upstream fetch time, observed time, model metadata,
  error state, token count, and web-search state.
- `ai_brand_mentions`, linked to an answer, preserving the raw and normalized
  detected name. Resolution to `ai_brands` is nullable and reversible.
- `ai_citations` as separate normalized rows.

That separation is the right source of truth for Phase 4:

- The raw answer is produced by Prompt Explorer's four-model LLM-response path:
  ChatGPT, Claude, Gemini, and Perplexity are enumerated in
  [`PROMPT_EXPLORER_MODELS`](../../../src/types/schemas/ai-search.ts#L141).
  [`shapeSuccess`](../../../src/server/features/ai-search/services/promptExplorer.ts#L153)
  extracts and retains the answer `text`.
- [`extractText`](../../../src/server/features/ai-search/services/promptExplorer.ts#L197)
  preserves text within message sections and their order, joining sections
  with blank lines. Phase 0 must persist this canonical text without further
  whitespace collapsing or HTML rendering before Phase 4 reads it. Real
  listicle and Markdown-table samples should verify that the canonicalization
  preserves row/list reading order.
- The two-platform LLM-mentions path is not an answer corpus.
  [`LlmPlatform`](../../../src/server/lib/dataforseo/shared.ts#L11) is only
  `chat_gpt | google`, and
  [`llmMentionItemSchema`](../../../src/server/lib/dataforseoLlmSchemas.ts#L42)
  contains the question, sources, dates, volume, and brand-entity titles—but no
  answer text. It cannot support sentiment context or ordinal extraction.
- The current Prompt Explorer `brandMentioned` boolean is also insufficient.
  [`computeBrandMentioned`](../../../src/server/features/ai-search/services/promptExplorer.ts#L240)
  returns true when either the text matches or a citation URL/title matches.
  Citation-only matches belong in `ai_citations`; they must not receive brand
  sentiment or answer position.
- Prompt Explorer currently highlights only one caller-supplied brand. Phase 4
  needs every detected candidate from the answer, resolved through the Phase 3
  registry and aliases, in the same scoring request.

## Position extraction contract for multi-brand answers

The plan does not yet define “ordinal position.” That definition must be stable
before golden tests or analytics are meaningful. A common, inspectable
definition is **the order in which distinct brands are first mentioned in the
answer text**: position 1 is the first brand, position 2 the next previously
unseen brand, and so on. This matches the documented interpretation used by
other AI-visibility tooling, for example
[Keyword.com](https://support.keyword.com/en/articles/13889350-ai-visibility-metrics-explained-formulas-interpretation)
and
[BrandAxis](https://brandaxis.ai/docs/glossary/#rank).

Under that contract, extraction needs:

- The full canonical raw answer, including list and table row order.
- All answer-text mention candidates, not just the tracked brand.
- Canonical brand IDs plus the exact aliases/raw spellings that matched.
- Answer-local occurrence order. Character start/end offsets are the most
  auditable representation; without offsets, Phase 4 has to ask a model to
  rediscover which occurrence a mention row represents.
- Phase 3 suppression/review state so generic terms such as “AI” or “Agency”
  do not consume positions.

Rules for ambiguous multi-brand answers should be explicit:

- Multiple mentions and aliases resolving to the same canonical brand share
  one position, based on the brand's first occurrence.
- Positions are dense across distinct included brands; repeats do not create
  gaps.
- Listicle and table order follow rendered reading order. An explicit rank
  column may override row order only if that exception is part of the contract
  and golden set.
- Citation titles, citation URLs, and source lists do not create a brand
  position unless the brand also appears in the answer body.
- Suppressed generic entities are excluded. Unresolved/ambiguous candidates
  remain inspectable but do not silently alter canonical leaderboard ranks.
- If no defensible ordering can be produced, position is null. A scorer must
  never invent an absent brand or force a numeric result.

Position is answer-level, while Phase 0 currently describes only the contents
of a mention row. It does not say whether `ai_brand_mentions` is one row per
text occurrence, one row per distinct surface form, or one row per answer ×
canonical brand. Phase 4 cannot leave this implicit:

- If rows are occurrences, each needs an answer-local offset; all occurrences
  resolving to one brand receive the same position, and analytics dedupe by
  answer × canonical brand.
- If rows are already unique answer-brand observations, retain the evidence
  spans/raw variants separately so the rank can be audited and later
  re-resolved.

If the plan's instruction to run position through the provider abstraction is
retained, the model should receive stable mention IDs and may return only those
IDs. Zod validation and deterministic post-processing must reject unknown IDs,
duplicate brand positions, non-positive/non-integer values, and inconsistent
ordering. The first-occurrence calculation should remain the golden oracle for
ordinary prose, listicles, and tables; a model judgement should be used only
for a separately defined semantic-ranking exception.

## Sentiment output and retry boundaries

Sentiment should be returned in the same answer-level structured call, keyed by
stored mention ID, with a small closed vocabulary such as positive, neutral,
negative, and mixed/uncertain. A numeric display score may be derived later,
but the persisted model judgement needs its label, scorer model, prompt version,
and timestamp. Invalid, missing, or contradictory output remains null.

The attempt is the idempotency boundary. A workflow replay must not issue a
second paid scoring call after a successful attempt was durably committed.
When a retry is genuinely required, preserve both attempts' costs but only the
latest successful, matching scorer-version result should populate the mention
fields.

Brand resolution is reversible, so scorer provenance matters. A later alias
merge or split must either deterministically reassign the stored answer-level
position/sentiment evidence or enqueue rescoring; it must not silently present
an old judgement as if it were made against the new entity set.

## Audit gate and decisions required before build

Phase 4 is not ready to build until the following are explicit:

1. Confirm that position means first distinct body-text mention, or document a
   different ordinal contract.
2. Define `ai_brand_mentions` cardinality and retain answer-local occurrence
   evidence.
3. Add a scoring-attempt cost ledger with `actual | estimated | unknown`
   provenance and separate acquisition/scoring totals.
4. Require a custom-provider pricing policy for scheduled scoring; missing
   metadata must not become zero.
5. Define whether one scorer call returns both sentiment and position. One call
   per answer is the recommended cost and consistency boundary.
6. Preserve citation-only matches as citations, not sentiment-bearing mentions.

The Phase 4 exit gate should be read as: every valid answer-text brand
observation has either a versioned sentiment/position result or an explicit
null processing outcome; every scoring attempt has known or explicitly unknown
cost provenance; and no scoring or billing failure can block answer ingest or
completion of the parent run.
