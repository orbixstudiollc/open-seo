# Phase 9 onboarding and suggestions build report

Produced 28 Jul 2026 for `phase-9-onboarding-suggestions`.

## Audit-first result

Before implementation, the Phase 9 brief, `DESIGN.md`, the existing AI
Visibility client feature, brand-resolution service and repository, prompt
tracking service and repository, Search Console services, and Phase 0/1 build
reports were read in full. The build reuses those seams:

- brand setup goes through the existing brand registry and canonical resolution
  rules;
- prompt setup goes through the existing prompt-set, topic, prompt, settings,
  and guarded run services;
- query discovery goes through the existing Search Console performance service;
- running a setup uses the existing whole-set run guard, never a Phase 10
  single-prompt path.

## Shipped

- A five-step first-run wizard at `/p/$projectId/visibility`, shown whenever the
  project lacks a primary brand or a non-archived prompt set:
  1. primary brand and domain;
  2. competitors;
  3. prompt set, editable starter topics/prompts, and free-text additions;
  4. estimated prompt × model calls against the monthly run cap;
  5. run the configured set now or retain the weekly schedule.
- Atomic primary-brand and competitor configuration, including normalized,
  distinct names and canonical manual brand-resolution rules.
- A suggestion queue for configured projects, with prompt-set selection,
  refresh, source labels, approve, and reject controls.
- Free suggestion generation from:
  - question- and comparison-shaped queries returned by the existing GSC
    performance service, ordered by impressions;
  - gaps beneath existing prompt topics.
- Prompt lifecycle states `active`, `suggested`, and `rejected`, plus
  `gsc`/`topic_gap` source provenance. Only active prompts enter tracked runs.
- Durable decision behavior:
  - approve moves a suggestion into the active prompt set;
  - reject keeps the row as rejected;
  - the existing set/text uniqueness boundary prevents a rejected prompt from
    being inserted again;
  - repeated same-decision requests are idempotent and contradictory later
    decisions are refused.
- `manage_ai_prompt_tracking` MCP actions for `suggest`, `approve`, and `reject`.
  Suggestion refresh uses GSC only and makes no paid AI-provider call.

All new UI uses the global `--app-*` design language through the shared
daisyUI components and renders in both explicit themes. No answer viewer, brand
drill-down, or single-prompt run was added or changed.

## Data model

Commit `abc4fa0` (`feat: add prompt suggestion lifecycle`) contains the schema
and both generated dialect migrations together:

- D1/SQLite: `drizzle/0044_careful_jasper_sitwell.sql`
- Postgres: `drizzle-pg/0021_nappy_sister_grimm.sql`

Both add lifecycle state, suggestion source, and the set/state/order lookup
index to `ai_tracked_prompts`. `pnpm run db:generate` reports no schema changes
for either dialect after generation.

The complete local D1 migration history, including 0044, was applied to a fresh
browser-test database. Dialect-parity and dual-repository integration tests
cover default-active rows, suggested → active, suggested → rejected, rejected
conflict retention, and active-only runnable definitions. A live Postgres
database was not configured in this workspace; the generated Postgres SQL,
snapshot, parity tests, and Postgres repository contract are the available
verification here.

## Behavioral verification

A Playwright pass against the local application exercised the complete fresh
project flow:

- created the primary brand/domain and competitors entirely in the wizard;
- edited the starter prompt set and reviewed 6 prompts × 4 models = 24 calls
  against a 200-call cap;
- chose the weekly configuration path and reached the configured Visibility
  overview;
- generated topic-gap suggestions, approved one, rejected one, reloaded, and
  confirmed both decisions remained out of the pending queue;
- refreshed again and confirmed the rejected prompt did not resurface.

GSC extraction is covered at the service boundary with the existing
`GscService.getPerformance` mocked to return question/comparison query rows;
the test verifies only qualifying GSC rows become `gsc` suggestions. The browser
database also included a persisted `gsc` suggestion to verify the Search Console
label and approve/reload behavior. No live Google credential was available, so
the browser pass did not call the external GSC API.

Visual checks covered:

- desktop light wizard;
- desktop dark cost review;
- mobile dark completion at 390 × 844;
- configured dark suggestion queue with both `Topic gap` and
  `Search Console` provenance.

There were no page errors or horizontal overflow. The sole console response was
the existing `local_noauth` `/api/auth/get-session` 404 already recorded in
`.agents/PAPERCUTS.md`.

## Automated verification

- Focused Phase 9 tests: 249 passed, 5 skipped.
- `pnpm run test:ci`: 130 files passed; 1,007 tests passed, 5 skipped.
- `pnpm run db:generate`: green; no D1 or Postgres schema drift.
- `pnpm run build`: green, including client, SSR, and TypeScript.
- `pnpm run ci:check`: green, including repository-wide Prettier, Knip, both
  TypeScript projects, and type-aware Oxlint.
- `git diff --check`: green.

The first CI run exposed the already logged repository papercut that the Phase
9 and Phase 10 briefs on `origin/main` were not Prettier-clean. Both briefs
received formatting-only changes so the required repository-wide gate could
pass; no Phase 10 implementation surface was touched.

## Exit gate

- [x] Fresh project reaches a completed first-run config entirely through the wizard
- [x] GSC-sourced suggestions appear with approve/reject; decisions persist
- [x] Both dialect migrations are in one commit; `ci:check` and the full suite are green
- [x] Build report exists at `.agents/plan/audits/phase-9-build-report.md`
