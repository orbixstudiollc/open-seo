# Phase 2 — visibility analytics design

Produced 27 Jul 2026 for the Phase 2 implementation.

## Product and route

Add a project-scoped AI Visibility overview at
`/p/$projectId/visibility`. It reads only persisted Phase 0 observations and
does not start runs, change cadence, meter usage, or call a paid provider. The
page offers 7, 30, and 90-day windows and shows:

- headline Visibility %, its prior-period percentage-point delta or an explicit
  insufficient-history state;
- a daily visibility trend with observation counts and preserved gaps;
- per-platform, per-topic, and per-prompt visibility breakdowns;
- a separately labelled Share of Voice leaderboard for the primary and
  competitor brands in the project registry.

The stored answer `model` is the platform-success cohort key. `modelName` is
display metadata only. This keeps analytics open to the Phase 1 model set
without confusing the two-platform Brand Lookup API type with persisted answer
models.

## Metric contract

Visibility is an answer-level rate:

`distinct successful answers mentioning the primary brand / successful answers × 100`.

Only answers whose status is `success` enter either side. A successful answer
with no primary-brand mention is a known zero. Failed or absent answers are
unknown and are never zero-filled. Multiple aliases or mention rows in one
answer count once for Visibility.

Share of Voice remains a mention-volume metric:

`brand mention_count / mention_count across requested registry brands × 100`.

The service seeds the primary brand and every active competitor, resolves rows
by stable `brandId`, and ignores unrequested/unresolved mentions in the
denominator. Case-insensitive normalized registry names prevent duplicate
display groups. Successful cohorts with no mentions produce known-zero mention
counts but a `null` percentage when the total denominator is zero. The response
lists only models with successful answers, so a partial result never claims
coverage from an unavailable platform.

## Time and comparison rules

All analytics use the run's `startedAt` and UTC. With server `asOf` and a window
of `N` days, the current period is `[asOf − N days, asOf)` and the previous
period is `[asOf − 2N days, asOf − N days)`. These adjacent half-open intervals
cannot double-count the boundary and have identical elapsed durations, including
the current partial day.

Daily trend points exist only for UTC dates containing successful answers. No
synthetic dates are emitted. An observed date with successful answers and no
primary mention is emitted as 0%; a missing date remains a visual gap.

Delta is percentage-point change, never relative-percent change. It is numeric
only when all comparison checks pass:

1. the earliest stored answer is at or before the previous-period start;
2. both periods have successful answers;
3. both periods have the same successful `trackedPromptId × model` cohort;
4. successful answers cover at least 80% of expected answer slots in each
   period, using run counters with persisted answer rows as a defensive floor;
5. the smaller successful-answer count is at least 80% of the larger count.

Otherwise `deltaPctPoints` is `null` with a machine-readable reason
(`not_enough_elapsed_history`, `no_previous_answers`,
`cohort_changed`, or `coverage_too_low`) and user-facing copy. Current-period
metrics still render with their actual observation counts.

## Architecture and data access

Follow the repository convention without changing Phase 1-owned execution code:

`TanStack server function → analytics service → analytics repository`.

The repository performs project-scoped, bounded reads across `ai_runs`,
`ai_answers`, `ai_brand_mentions`, `ai_brands`, `ai_tracked_prompts`, and
`ai_prompt_topics`. It returns normalized rows; the service owns time parsing,
cohort checks, distinct-answer arithmetic, nullable shaping, sorting, and
rounding. Date filtering is applied after parsing stored text timestamps so
SQLite's `YYYY-MM-DD HH:MM:SS` defaults and Postgres/ISO timestamps have
identical semantics. The bounded read begins at the previous-period start; a
separate oldest-observation read supplies the elapsed-history check. No schema
or migration change is required.

The server input is Zod-validated (`projectId`, 7/30/90 days), and project
middleware replaces the caller-supplied project ID with the authorized context
ID. The same read-only service result is exposed to MCP.

## Interface

`DESIGN.md` is authoritative only for this new surface. Scope warm-cream/ink,
hairline, card, muted, and orange accent variables to the visibility page and
provide dark-theme counterparts. Use the unlicensed-font fallback
`system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif`; use 400-weight,
slightly tracked display type, 12px-radius cards, 16–24px internal spacing, no
shadows, and orange only for selection and the primary trend.

The page caps near 1200px. Cards are one column on mobile, two columns at large
width, and controls wrap with 40px touch targets. The trend card always renders:
no observations, insufficient comparison history, and coverage gaps are
deliberate states rather than omitted panels or flat lines. Tables collapse to
readable stacked rows on narrow screens.

## Verification

Unit fixtures cover multi-week history, missing days, exact period boundaries,
successful zeroes, failed answers, seeded competitors, cohort changes, low
coverage, and 7/30/90-day windows. A deterministic local D1 fixture script
creates a primary brand, competitors, topics, prompts, and gapped stored runs
without provider calls. Browser verification covers light and dark desktop
themes plus a mobile viewport before the final `ci:check`.
