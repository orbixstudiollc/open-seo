# Phase 0 — Persistence foundation

**Blocks:** every other phase. **Effort:** 2–3 weeks. **Depends on:** nothing.

## Why this exists

`src/server/features/ai-search/` already does the hard part — DataForSEO LLM
mentions, competitor share-of-voice, cited-source ranking, multi-model prompt
fan-out. But every one of those is an **on-demand lookup cached in R2 for seven
days**. Nothing is stored, so nothing can trend.

This phase adds memory. Nothing user-visible ships, which makes it the phase most
likely to be skipped and the least survivable if it is.

## 1. Audit first

Read before writing:

- All 14 tables in `src/db/app.schema.ts` and the Postgres twin in `src/db/pg/`.
- **How rank tracking models time-series rows** — it already solves the shape you
  need. Do not invent a second pattern.
- `src/server/features/ai-search/services/brandLookup.ts` — specifically the R2
  cache keys via `buildCacheKey`. Stored runs and cached lookups must not diverge
  into two sources of truth.
- An existing repository under `src/server/features/*/repositories/` for the
  house style.

Write down what you found before designing.

## 2. Build

Tables covering: tracked prompt sets, runs, answers, brand mentions, citations,
and a brand registry. Authored for **both** dialects. Repositories following
`server fn → service → repository`.

Decide retention now, not after the tables are large.

## 3. Review

- Index coverage against the queries Phase 2 will actually run (time-windowed
  aggregation by project, prompt, brand).
- Retention and pruning policy.

## 4. Test

- Repository round-trip tests on both dialects.
- Migrations applied to a scratch D1 **and** a scratch Postgres and verified —
  generating them is not the same as running them.

## 5. Exit gate

- [ ] A synthetic run writes and reads back on both dialects
- [ ] `pnpm run db:generate:d1` and `db:generate:pg` both clean
- [ ] `pnpm run ci:check` green
- [ ] Retention policy documented

## Known risk

Dual-dialect drift — a column type valid in SQLite but not Postgres surfaces only
at deploy. Mitigate by generating both migrations in the same commit, always.
