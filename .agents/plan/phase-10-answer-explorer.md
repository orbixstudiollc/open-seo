# Phase 10 — Answer viewer, brand drill-down, single-prompt run (HIGH PRIORITY)

Gap source: ZeroRank flow comparison, 28 Jul. Exit gate at bottom.

## Build
1. **Answer viewer**: per-prompt/per-model reading view of stored raw answer
   text (ai_answers.rawAnswerText from Phase 0), with brand mentions highlighted
   (offsets exist from Phase 4), sentiment/position badges, citations listed.
   Route under the visibility area; paginate; never render answer HTML — text only.
2. **Per-brand drill-down**: brand detail page from the Share-of-Voice
   leaderboard: mention trend, sentiment history, avg position, top answers,
   citation overlap. Aggregation reuses visibilityAnalytics conventions
   (half-open windows, null-not-zero).
3. **Single-prompt run**: run one prompt × enabled models on demand
   (4 paid calls) through the SAME atomic reservation/cap path as full runs
   (beginAiTrackedRun-equivalent for a one-prompt subset or a scoped run row —
   audit which is cleaner; replay-safe tuples mandatory). UI button per prompt +
   MCP action. Refusal states surface cap/credit reasons.

## Audit first
Read: phase-0/1/4 build reports, aiTrackedRunGuards/Execution, visibility
analytics services, answer schema. Journal tail 0043/0020 — Phase 9 (parallel)
takes 0044/0021; take the next free and expect renumber on merge.

## Do not touch
Wizard/suggestions surfaces (Phase 9 agent owns).

## Exit gate
- [ ] Stored answers readable per prompt/model with highlighted mentions
- [ ] Brand detail page renders for every leaderboard brand, both themes
- [ ] Single-prompt run reserves atomically, replays safely, and refuses over cap
- [ ] ci:check green; full suite green; build report phase-10-build-report.md
