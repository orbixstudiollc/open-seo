# Phase 2 — Visibility analytics & dashboard

**Effort:** 2 weeks. **Depends on:** Phase 1 gate passed. **First user-visible value.**

## Why this exists

Rolls stored runs into the numbers the category leads with: visibility %,
per-prompt and per-topic breakdowns, movement against the prior period.

## 1. Audit first

- Read `services/shareOfVoice.ts` **in full** before touching aggregation. Its
  competitor dedupe and paid-slot logic encode decisions worth preserving —
  particularly the case-insensitive dedupe that stops "Nike" and "nike" becoming
  two billed groups.
- Read the existing Brand Lookup route to understand its layout patterns and
  data presentation.
- Read `/DESIGN.md` at the repo root. **It is the visual authority for the new
  overview** — tokens, type scale, spacing rhythm, card treatment. Where it
  conflicts with the current daisyUI look of existing pages, DESIGN.md wins for
  the new AI-visibility surfaces; do not restyle existing pages.

## 2. Build

- Aggregation over stored runs, reusing `shareOfVoice.ts` logic.
- 7 / 30 / 90-day windows.
- Delta vs previous period.
- Overview route beside the existing Brand Lookup page.

## 3. Review

Check the arithmetic on period deltas at boundaries. Partial first periods and
missing days are where trend maths quietly lies — a 3-day-old install must not
render a confident-looking flat line.

## 4. Test

- Aggregation unit tests with seeded multi-week fixtures **including gaps**.
- Visual verification in the browser: both themes, mobile width.

## 5. Exit gate

- [ ] Trend renders from real stored history
- [ ] An explicit "insufficient history" state shows for the first weeks
- [ ] Both themes and mobile verified
- [ ] `ci:check` green

## Note

ZeroRank shows five empty months on its own trend table. Design the empty state
deliberately — it will be your state too for the first month.
