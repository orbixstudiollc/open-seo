# Phase 0 — persistence audit findings (workspace: chennai)

Produced 27 Jul 2026 by the parallel audit pass (GPT-5.6 Sol via Conductor). Read-only audit; no code was modified.

---

I completed the Audit step and made no code changes. The worktree remains clean.

## Audit findings

- The brief says 14 application tables, but both [SQLite schema](src/db/app.schema.ts) and [Postgres schema](src/db/pg/app.schema.ts) currently define 13. Their structures match.
- Repositories use one provider-aware schema barrel and one implementation for both databases. A parity test checks table sets, columns, primary keys, unique constraints, and foreign keys, but not ordinary indexes.
- Cross-dialect conventions are:
  - Text UUIDs for logical entities and runs.
  - SQLite autoincrement/Postgres `serial` for high-volume observation rows.
  - SQLite integer booleans/Postgres native booleans.
  - Timestamps remain text in both dialects.
  - SQLite defaults produce `YYYY-MM-DD HH:MM:SS`; Postgres defaults produce ISO timestamps. Queries must not compare values originating from different backends or assume byte-identical formatting.

### Rank-tracking time-series pattern

Rank tracking uses four layers:

1. A mutable, soft-disabled configuration.
2. Mutable tracked keywords.
3. An execution row with status, counters, project/config ownership, and start/completion timestamps.
4. Immutable observation rows, one per run × keyword × device.

Important invariants to reuse:

- A partial unique index prevents more than one pending/running run per configuration.
- Observation inserts are idempotent through a unique run/entity/dimension tuple.
- Historical observations copy the keyword text and intentionally do not reference the mutable keyword row, so deleting a keyword does not erase history.
- Trends include only completed runs; full-set trends exclude subset runs.
- The run’s `startedAt` is the time-series timestamp because child rows within a run may have different insertion times.
- `null` represents an observed outcome such as “not found,” not a missing observation.
- Query indexes support both run-oriented reads and entity/time history.
- D1’s low bound-parameter limit is handled explicitly by batching.

### Cache/source-of-truth findings

There are two different cache lifetimes:

- Brand Lookup: 24 hours.
- Prompt Explorer model responses: 7 days.

`buildCacheKey` sorts top-level parameters and hashes the resulting JSON. Brand Lookup keys include organization, project, canonical target, sorted competitors, and locale. Prompt-response keys include organization, project, model, normalized prompt, web-search settings, and a system-prompt version.

Prompt responses deliberately exclude the highlighted brand from the key; brand matching is recomputed after retrieval. Cached payloads are Zod-validated, and incomplete Brand Lookup results are not cached.

Therefore, stored history should persist the exact canonical response returned by the acquisition path—whether it came from R2 or upstream—along with its cache key and original fetch time. R2 remains a temporary acquisition optimization, not a second historical record.

### Repository style

The house style is flat module functions exported as a repository object, using inferred Drizzle insert/select types. Writes use targeted conflict handling and shared batching helpers. Validation belongs at the server/service boundary.

## Proposed persistence design

I recommend these normalized tables:

- `ai_prompt_sets`
- `ai_prompt_set_models`
- `ai_prompt_topics`
- `ai_tracked_prompts`
- `ai_prompt_tags`
- `ai_prompt_tag_assignments`
- `ai_brands`
- `ai_brand_aliases`
- `ai_runs`
- `ai_answers`
- `ai_brand_mentions`
- `ai_citations`

Key decisions:

- Prompt sets and brands are archived rather than hard-deleted.
- Answers copy `tracked_prompt_id` and prompt text without an FK to the mutable prompt, mirroring rank snapshots.
- Runs have a partial unique active-run index and terminal statuses supporting partial model failure.
- Answers are unique by run × prompt × model and store raw answer text, cache key, upstream fetch time, observed time, model metadata, errors, token count, and web-search state.
- Mentions preserve the raw and normalized detected name. Resolution to a registry brand is nullable and reversible; aliases never overwrite the underlying mention.
- Citations are normalized rows containing sanitized URL, hostname, title, and source order—not JSON embedded in answers.
- Database model/platform columns remain text and are validated with shared TypeScript/Zod constants. This avoids a migration whenever upstream adds a model.
- Phase 2 queries start from `ai_runs(project_id, started_at)`, then join through indexed answers to mentions or citations. Additional indexes cover prompt/run, brand/answer, and domain/answer access.
- Idempotency follows rank tracking: unique execution/observation tuples and targeted `ON CONFLICT` behavior.

Retention recommendation: keep terminal run detail, raw answers, mentions, and citations for 400 days. This supports 7/30/90-day analytics plus year-over-year comparison while bounding the largest text tables. Configuration, prompts, topics, tags, brands, and aliases remain until their project is deleted. Pruning deletes terminal runs in bounded batches and relies on cascades; active runs are never pruned.

One roadmap inconsistency needs an explicit ruling: Phase 1’s cost table assumes two `LlmPlatform` values, while Prompt Explorer currently has four live answer models. Raw answer text required by Phase 4 is available through the four-model response path, not the currently shaped two-platform mentions data. My recommendation is to keep Phase 0’s schema model-agnostic and settle the initial enabled model set during Phase 1’s cost review.

Please confirm this schema shape, the 400-day retention period, and the model-agnostic approach. Once agreed, I’ll implement both dialects and generate both migrations in the same commit.
