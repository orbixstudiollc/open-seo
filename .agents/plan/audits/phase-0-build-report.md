# Phase 0 persistence build report

## Shipped

- Twelve normalized AI visibility tables for both SQLite/D1 and Postgres:
  prompt sets, enabled models, topics, tracked prompts, tags, tag assignments,
  brands, aliases, runs, answers, brand mentions, and citations.
- Immutable run observations copy prompt text and preserve cache identity and
  upstream fetch time. Mutable prompt and brand configuration is archived rather
  than age-pruned.
- Database invariants for one active run per prompt set, one answer per
  run/prompt/model, idempotent mention and citation writes, project ownership,
  and cascading run-detail deletion.
- A provider-aware repository with configuration and registry reads, synthetic
  run write/read support, bounded observation reads, model-identifier Zod
  validation, and bounded 400-day retention pruning.
- Read-only `get_ai_visibility_state` MCP access with project authorization,
  bounded prompt/answer payloads, and no paid upstream calls.
- Permanent retention documentation in
  `docs/AI_VISIBILITY_DATA_RETENTION.md`.
- SQLite migration `drizzle/0037_uneven_wild_child.sql` and Postgres migration
  `drizzle-pg/0014_unknown_revanche.sql`, generated in the same change.

## Verified

- Applied the complete SQLite migration history to an isolated persisted D1
  scratch store. All 12 `ai_*` tables were present and a repository-written
  synthetic run read back successfully.
- Applied the complete Postgres migration history to a fresh Postgres 16
  scratch database. All 12 `ai_*` tables were present.
- Ran the same repository contract against SQLite and scratch Postgres. It
  round-tripped all 12 tables and verified active-run exclusion, idempotent
  observations, copied prompt history, retention cascades, and preservation of
  configuration/registry rows.
- `pnpm run db:generate:d1` and `pnpm run db:generate:pg` both reported no
  remaining schema changes after generation.
- Schema parity: 168 assertions passed.
- Full unit/integration suite: 94 files passed, 794 tests passed. The default
  run skips the environment-gated Postgres contract; the explicit scratch
  Postgres run passed it.
- Final focused dual-dialect/MCP/parity run: 172 tests passed.
- `pnpm run ci:check`: green.

## Deferred

- Scheduling, cadence enforcement, per-project run caps, upstream execution,
  cost metering, and the initial enabled-model set remain Phase 1 work.
- Analytics and user-facing trend views remain Phase 2 work.
- Automated recurring invocation of the implemented retention repository method
  should be attached to the Phase 1 scheduled runner.
