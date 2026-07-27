# Phase 2 — analytics audit findings (workspace: bissau)

Produced 27 Jul 2026 by the parallel audit pass (GPT-5.6 Sol via Conductor). Read-only audit; no code was modified.

---

## Phase 2 audit findings

No files were modified; the working tree remains clean.

### Existing aggregation worth reusing

[shareOfVoice.ts](src/server/features/ai-search/services/shareOfVoice.ts) already provides several important aggregation rules:

- `resolveCompetitorGroups` canonicalizes each input with `detectTarget`, deduplicates resolved values case-insensitively, and removes competitors that resolve to the tracked target.
- `computeShareOfVoice` seeds every requested target and competitor before processing results. A paid comparison therefore remains visible even when the provider returns no corresponding row.
- Provider keys are matched case-insensitively, preventing provider normalization from orphaning the target or losing its `isTarget` marker.
- Only requested rows affect the denominator. Unexpected provider rows are ignored.
- Only successful platform calls contribute. The returned `platforms` list records exactly which platforms were included, allowing the UI to describe partial results honestly.
- `sumNullable` preserves the distinction between missing data and numeric zero: all-null inputs remain `null`, while known values are summed.
- Values are rounded through `roundOrNull`, percentages are guarded against a zero denominator, and leaderboard rows are sorted by mentions with missing rows last.

[brandLookupShaping.ts](src/server/features/ai-search/services/brandLookupShaping.ts) contains additional reusable precedent:

- Per-platform mention and search-volume totals use the same nullable summation.
- ChatGPT is excluded from combined totals when the selected locale is not compatible with its US/en-only dataset.
- Monthly volume is grouped by year/month, summed across eligible platform bundles, sorted chronologically, and limited to the latest 12 months.

The monthly function is based on DataForSEO’s lookup sample, not persisted tracked runs, so its query cannot be reused directly. Its grouping, locale, rounding, and missing-value rules can.

One unresolved design point remains: the plan names “visibility %” but does not define its denominator. Brand Lookup’s Share of Voice is competitor mention share, which is not automatically the same as the percentage of tracked prompt-platform answers that mention the project’s brand. Phase 2 should reuse the established semantics without assuming the two formulas are interchangeable.

### Competitor dedupe and paid-slot guarantees

The dedupe must remain at the resolved-target layer:

- `"Nike"` and `"nike"` become one comparison group.
- Equivalent domains such as `"puma.com"` and `"www.PUMA.com"` become one group after target detection.
- A competitor equivalent to the primary target is dropped.
- The first distinct resolved spelling is retained as the display label, preserving stable user-facing rows.
- If all competitors collapse away, [brandLookup.ts](src/server/features/ai-search/services/brandLookup.ts) skips the paid cross-aggregated calls entirely.
- The normalized, lowercased, sorted competitor set is also part of the cache key. Case or input order changes therefore reuse the same paid cache entry.

These rules prevent duplicate leaderboard rows, duplicate denominators, and redundant paid comparison groups. Dedupe only in the form or URL parser would be insufficient because that parser is case-sensitive and does not understand domain equivalence.

The result-shaping guarantees should also remain: requested-but-missing competitors render as “no data,” not as zero or as silently absent; known-zero and missing remain distinct; and a single successful platform must not be presented as a two-platform comparison.

### Visual consistency with Brand Lookup

The new overview should follow the composition in [BrandLookupPage.tsx](src/client/features/ai-search/BrandLookupPage.tsx) and [BrandLookupResults.tsx](src/client/features/ai-search/components/BrandLookupResults.tsx):

- Use the same responsive `max-w-7xl` page container, compact page title/subtitle, and `space-y-4` rhythm.
- Use theme tokens such as `base-100`, `base-200`, `base-300`, `base-content`, and `primary`, rather than introducing fixed light/dark colors.
- Reuse rounded, bordered cards with separated headers and content.
- Keep overview cards in a single column until the existing `lg:grid-cols-2` breakpoint.
- Match the established metric hierarchy: small uppercase labels, large semibold tabular numbers, muted platform/detail rows, and concise tooltips.
- Preserve platform dots and labels, “You” highlighting, warning/info panels, and explicit unavailable states.
- Keep charts at the existing compact height and use the same grid, axis, tooltip, and card treatment.
- Let controls wrap on narrow screens and avoid a desktop-only dashboard grid.

The empty state needs one deliberate departure from the current result composition. [BrandLookupMentionTrendCard.tsx](src/client/features/ai-search/components/BrandLookupMentionTrendCard.tsx) contains “Not enough historical data yet,” but its parent omits the trend card whenever the dataset is empty. Phase 2 explicitly requires the insufficient-history state to remain visible. Also, that chart currently converts null volume to zero; stored-run gaps must not inherit that behavior because it would draw missing observations as real zero visibility.

### Period-boundary risks

For 7-, 30-, and 90-day comparisons:

- Use adjacent, non-overlapping half-open intervals with one documented timezone. Inclusive endpoints can count a boundary run twice.
- Do not compare a partial current day with a complete historical day unless both periods are clipped to equivalent elapsed time.
- A new installation with only three days of history has no complete prior 7/30/90-day comparison. Its delta should be `null` with an explicit insufficient-history state.
- Missing scheduled runs, failed models, and incomplete writes are unknown data, not zero visibility.
- A successful answer that did not mention the brand is a genuine zero. That distinction should mirror `sumNullable`.
- Comparing periods with different prompt sets, platforms, topics, or success coverage can manufacture movement. Deltas should use a comparable cohort or clearly disclose coverage changes.
- Raw totals are especially misleading when one period contains fewer completed runs. Visibility ratios still require coverage checks; a percentage based on one successful answer should not look as confident as one based on hundreds.
- Filling missing days with zero creates false drops and flat lines. Preserve gaps in trend data and expose observation or coverage counts.
- Percentage-point change and relative-percent change are different measures. The UI and API should select and label one explicitly.

The Phase 2 gate should therefore require both sufficient elapsed history and adequate comparable-run coverage before returning a numeric delta.
