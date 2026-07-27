# Phase 2 — visibility analytics build report

Produced 27 Jul 2026 for `phase-2-visibility-dashboard`.

## Shipped

- A project-scoped AI Visibility overview at
  `/p/$projectId/visibility`, linked under **My Site** beside the existing
  AI-search research surfaces.
- Persisted-run aggregation over the Phase 0 `ai_runs`, `ai_answers`,
  `ai_brand_mentions`, `ai_brands`, `ai_tracked_prompts`, and
  `ai_prompt_topics` tables. No schema or migration changes were required.
- 7, 30, and 90-day windows using adjacent UTC half-open intervals:
  `[asOf − N days, asOf)` and `[asOf − 2N days, asOf − N days)`.
- Headline Visibility % defined as distinct successful answers that mention the
  primary brand divided by successful answers. Successful non-mentions are
  known zeroes; failed and missing answers are excluded rather than zero-filled.
- Percentage-point deltas that become numeric only with:
  - a complete elapsed previous period;
  - successful answers in both periods;
  - the same successful prompt × model cohort;
  - at least 80% expected-answer coverage in both periods; and
  - successful-answer volume within 80% between periods.
- Explicit comparison states for insufficient elapsed history, no previous
  answers, cohort changes, and inadequate coverage. A current metric can still
  render while its delta remains `null`.
- Daily trend points with observation counts. Observed zero-mention days render
  at 0%; dates without successful observations render as null chart gaps.
- Per-platform, per-topic, and per-prompt answer visibility, including failed
  answer counts and unavailable values.
- Separately labelled Share of Voice based on registry-brand mention volume.
  The primary brand and active competitors are seeded, normalized names are
  deduplicated case-insensitively, unrequested/unresolved mentions cannot change
  the denominator, and only successful model cohorts are disclosed.
- A read-only `get_ai_visibility_analytics` MCP tool with the same authenticated
  project scope and coverage-aware result. It performs no provider work and
  spends no credits.
- A deterministic local D1 fixture command,
  `pnpm seed:ai-visibility`, that writes only Phase 0 records. It supports both
  long history and first-week states without touching scheduling, cadence, run
  admission, billing, or provider execution.

## Interface

- The new surface uses scoped `DESIGN.md` tokens: warm cream canvas, warm ink,
  white hairline cards, 12px card radius, no shadows, system-ui fallback type,
  and the exact orange accent. Existing pages were not restyled.
- The overview stacks to one column on mobile, keeps 40px range controls, and
  avoids horizontal overflow at 390px.
- The trend card always remains present. Empty, missing-day, and
  insufficient-history states are explained in place instead of being omitted
  or represented as flat lines.
- Light and dark desktop screenshots, mobile top/bottom screenshots, and a
  three-day insufficient-history screenshot were captured under
  `.context/screenshots/` during verification.

## Verified

- Aggregation unit fixtures cover:
  - exact half-open period boundaries for 7/30/90 days;
  - SQLite-space and ISO timestamps;
  - answer-level deduplication when a brand has multiple mention rows;
  - observed zeroes, missing days, and failed-only days;
  - insufficient elapsed history;
  - changed prompt/platform cohorts;
  - coverage below 80%;
  - seeded/deduplicated competitors; and
  - partial-platform disclosure.
- MCP tests verify authorized stored analytics and ensure insufficient history
  never becomes a fabricated zero delta.
- Full test suite: **96 files passed, 806 tests passed, 1 environment-gated
  Postgres test skipped**.
- Local D1 live verification:
  - 190 calendar days with deliberate gaps;
  - 4,200 persisted answers;
  - 4,933 persisted brand mentions;
  - a numeric 30-day trend and delta rendered from those rows;
  - the 7-day selector updated route state;
  - light desktop, dark desktop, and dark 390px mobile rendered without
    horizontal overflow or page errors.
- First-week live verification:
  - reseeded the same Phase 0 path with three days / 72 answers;
  - current Visibility rendered from observations;
  - the numeric delta was absent; and
  - both headline and trend card displayed **Insufficient history**.
- Production client and SSR bundles: green.
- `pnpm run ci:check`: green.

## Exit gate

- [x] Trend renders from real stored history
- [x] An explicit "insufficient history" state shows for the first weeks
- [x] Both themes and mobile verified
- [x] `ci:check` green

## Scope and notes

- Phase 1 scheduling, cadence, caps, workflows, model execution, and billing
  files were not changed.
- Phase 3 brand-resolution work was not started.
- The repository-wide Prettier gate also required formatting existing plan
  audit Markdown and `DESIGN.md`; those changes are mechanical only.
- Two reproducible local-development issues encountered during verification
  were recorded in `.agents/PAPERCUTS.md`: Node seed scripts loading the Worker
  schema barrel, and `pnpm dev` not applying the documented local auth default.
