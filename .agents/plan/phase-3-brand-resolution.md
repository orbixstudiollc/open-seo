# Phase 3 — Brand entity resolution

**Effort:** 1–2 weeks. **Depends on:** Phase 2 gate passed. **This is the differentiator.**

## Why this exists

The clearest place to beat the incumbent. ZeroRank's live workspace has **26
unmerged duplicate groups** and ranks **"SaaS" and "AI" as competitor brands** —
its own #1 row is a generic noun. Getting this right makes every number
downstream trustworthy.

Concrete failures observed in ZeroRank, 27 Jul 2026:

- `"SaaS"` ranked #1 at 45% visibility — not a brand
- `"AI"` ranked #5 at 26% — not a brand
- `Clay` and `Clay Global` as separate rows — splits your closest competitor's
  true share
- `Figma`, `Figma AI`, `Figma UI Kits`, `Figma Community` — four rows, one company
- One group collapsing sixteen entries: `Agency`, `Lazarev`, `Lazarev.`,
  `Lazarev.agency`, `Agency A/B/C`, `Product design agency`, `Wavespace`,
  `Wavespace Digital Agency`, `Brix Agency`, …

Use these as a free failing-test corpus.

## 1. Audit first

- `src/shared/targetDetection.ts` — `detectTarget` already normalises domains and
  handles case.
- `resolveCompetitorGroups` in `shareOfVoice.ts` — existing dedupe logic, already
  case-insensitive for a billing reason.

Do not re-derive either.

## 2. Build

- Brand registry with alias sets.
- Automatic clustering suggestions.
- A stop-list suppressing generic nouns and category terms **before** they reach
  a leaderboard.
- Manual merge and split.

## 3. Review

- Merge must be **reversible and non-destructive** — a wrong merge must not lose
  the underlying mentions.
- The stop-list must not silently suppress a real brand with a common-noun name.
  ("Clay" is a real agency. "SaaS" is not.) Decide how that line is drawn and
  make it inspectable.

## 4. Test

- Run clustering against the ZeroRank corpus above; assert all 26 groups resolve.
- Assert `SaaS` and `AI` are suppressed.
- Assert merge/split round-trips without data loss.

## 5. Exit gate

- [ ] On the same underlying data, "SaaS" and "AI" never appear as brands
- [ ] `Clay` / `Clay Global` resolve to one row
- [ ] Merge is reversible with no mention loss
- [ ] `ci:check` green

## Why this position in the order

Before Phases 4 and 5, so sentiment and citation rollups attach to resolved
entities rather than being recomputed later.
