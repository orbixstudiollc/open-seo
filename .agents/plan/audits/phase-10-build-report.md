# Phase 10 — answer explorer build report

Completed 28 Jul 2026.

## Shipped

- Added a paginated answer explorer at
  `/p/:projectId/visibility/answers`, filterable by prompt, model, and exact
  answer. Stored response bodies render as React text only. First-occurrence
  brand offsets produce non-overlapping highlights, with sentiment, position,
  and normalized citation details alongside each answer.
- Added a brand drill-down at
  `/p/:projectId/visibility/brands/:brandId` and linked every share-of-voice
  leaderboard brand to it. The page includes mention trend, sentiment history,
  average position, recent top answers, and citation-domain overlap.
- Added on-demand one-prompt runs to the prompt list and prompt breakdown rows,
  plus the `run_ai_tracked_prompt` MCP tool.
- Fixed the shared primary-button treatment so disabled buttons have reduced
  opacity, a non-interactive cursor, and no hover or active override.
- Extended the local visibility analytics seed so answer highlights,
  sentiment, position, and brand drill-down data can be exercised end to end.

## Admission and replay safety

Single-prompt runs use the normal `ai_runs` row and the existing
`beginAiTrackedRun` path with an optional tracked-prompt selector. The guard
verifies that the requested prompt is active, non-archived, and belongs to the
selected prompt set before it creates the run.

The run then reserves `1 × enabled models` through
`reserveProjectAnswerCalls`, the same conditional atomic project-cap update
used by full and scheduled runs. It retains the one-active-run-per-set
exclusion and launches the same Workflow. Provider work remains keyed and
claimed by the stable `(run ID, tracked prompt ID, model)` tuple, so Workflow
replay does not create a second paid call. Cap refusal returns the existing
requested, reserved, and cap values; plan and credit errors retain their
specific messages.

No schema or migration was needed. The pre-build audit confirmed that a prompt
subset is represented by existing run totals and snapshots without a new run
kind. The D1/Postgres journal tails therefore remain available to the parallel
Phase 9 work and subsequent phases.

## Analytics and UI invariants

- Brand detail reuses terminal-run and successful-answer boundaries from
  visibility analytics.
- Time ranges remain half-open `[start, end)`.
- Unavailable averages, sentiment, and overlap ratios remain `null`, not zero.
- Citation overlap deduplicates domains per answer before aggregation.
- Raw answer text is never passed to an HTML or Markdown renderer.
- New styles use global `--app-*` tokens in both light and dark themes.
- Phase 9 wizard and suggestion-queue product surfaces were not changed. Its
  plan file received formatter-only changes required by the repository gate.

## Verification

- `pnpm test`: 129 test files passed; 1,005 tests passed and 4 skipped.
- `pnpm run ci:check`: green, including formatting, Knip, both TypeScript
  checks, and Oxlint with zero warnings or errors.
- `pnpm exec vite build`: client and SSR production builds green.
- Browser verification against locally migrated and seeded D1 data covered
  both themes, all leaderboard brand links, eight paginated answer cards,
  literal-text answer rendering, mention highlighting, citations, and the
  disabled-primary state. No application console or HTTP errors were found.

## Exit gate

- [x] Stored answers readable per prompt/model with highlighted mentions
- [x] Brand detail page renders for every leaderboard brand, both themes
- [x] Single-prompt run reserves atomically, replays safely, and refuses over
      cap
- [x] `ci:check` green; full suite green; build report written
