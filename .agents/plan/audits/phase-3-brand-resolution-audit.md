# Phase 3 — brand resolution audit findings (workspace: port-of-spain)

Produced 27 Jul 2026 by the parallel audit pass (GPT-5.6 Sol via Conductor). Read-only audit; no code was modified.

---

## Audit findings

No files were modified.

### Existing normalisation and dedupe

[`detectTarget`](src/shared/targetDetection.ts:13) currently:

- Trims leading/trailing whitespace.
- Treats text as a domain when it has a dot and no whitespace.
- Normalises domains through [`normalizeDomain`](src/types/schemas/domain.ts:8), which lowercases, removes protocol/path/query/hash, and strips `www.`.
- Preserves keyword spelling, punctuation, and case. Keyword case is handled later by dedupe.

One discrepancy: `detectTarget`’s comment says it produces a “valid hostname,” but it only checks for a dot. It does not call the available public-suffix validator. Consequently, `Lazarev.` becomes the domain `lazarev.`, while `Lazarev` remains a keyword.

[`resolveCompetitorGroups`](src/server/features/ai-search/services/shareOfVoice.ts:27):

- Applies `detectTarget` to every competitor.
- Dedupes using the detected value lowercased.
- Removes competitors that exactly collide case-insensitively with the already-normalised target.
- Keeps the first spelling as the display label.
- Correctly collapses examples such as `Adidas`/`ADIDAS` and `puma.com`/`www.PUMA.com`.
- Does not perform punctuation, suffix, alias, product-family, or semantic resolution.

This exact dedupe is also used to avoid duplicate paid comparison groups and construct stable cache keys in [`brandLookup.ts`](src/server/features/ai-search/services/brandLookup.ts:51).

### Corpus assessment

The visible examples in the brief all fail the Phase 3 outcome:

| Input group                             | Current result                                                     |
| --------------------------------------- | ------------------------------------------------------------------ |
| `SaaS`                                  | Retained as a keyword/brand candidate                              |
| `AI`                                    | Retained as a keyword/brand candidate                              |
| `Clay`, `Clay Global`                   | Two separate rows                                                  |
| Four `Figma…` variants                  | Four separate rows                                                 |
| `Lazarev`, `Lazarev.`, `Lazarev.agency` | Three rows; the latter two are classified as domains               |
| `Wavespace`, `Wavespace Digital Agency` | Two separate rows                                                  |
| `Agency`, `Product design agency`       | Retained as brands                                                 |
| `Brix Agency`                           | Separate, which is appropriate unless evidence identifies an alias |

The heterogeneous sixteen-entry group should not simply become one entity. It appears to require at least:

- Suppression of generic terms such as `Agency` and `Product design agency`.
- Merge of genuine aliases such as the Lazarev variants.
- Merge of `Wavespace` variants.
- Preservation of unrelated brands such as Brix as separate entities.
- Review or splitting of ambiguous `Agency A/B/C` entries.

The current exact-match behavior avoids the incumbent’s dangerous over-merge, but it leaves the group unresolved.

The brief says there are 26 observed duplicate groups, but [the checked-in document](.agents/plan/phase-3-brand-resolution.md:7) does not enumerate all 26 or all members of the sixteen-entry group. Therefore, an individual pass/fail assessment of all 26 is not possible from this repository. The partial corpus is sufficient to establish that the current logic would not meet the stated test gate.

## Proposed brand-versus-category decision model

Do not make this distinction through a string stop-list alone. Use an inspectable resolution hierarchy:

1. **Manual decision**
   A project-level merge, split, suppress, or restore decision wins and records who made it and why.

2. **Verified brand registry**
   Match exact aliases to a canonical entity backed by evidence such as its primary domain, user-declared competitor status, or reviewed registry entry. Thus `Clay` resolves to the real agency entity and `Clay Global` can be a reviewed alias.

3. **Generic-term classification**
   Suppress `SaaS`, `AI`, `Agency`, and similar taxonomy terms only when no verified brand entity or strong contextual entity evidence matches them.

4. **Ambiguous conflict**
   If a term matches both a brand alias and a generic concept, do not silently suppress it. Mark it `needs_review`, keep it off the canonical leaderboard temporarily, and expose the raw mentions, evidence, and competing rules.

5. **Automatic clustering as suggestions**
   Suggest merges using corroborating evidence—shared domain, reviewed alias, consistent co-occurrence, or known product-to-company relationship. Token containment or generic suffix removal alone should not auto-merge entities.

Under this model:

- `Clay` → brand because it has a verified canonical entity/domain.
- `Clay Global` → Clay only through a registered alias or corroborated suggestion.
- `SaaS` and `AI` → generic concepts because they have no entity evidence in this corpus.
- `Figma AI`, `Figma UI Kits`, and `Figma Community` → Figma when registry/product-family evidence supports that relationship.
- `Brix Agency` does not merge into other agencies merely because it contains “Agency.”

Every raw mention should remain immutable and retain its original text. Resolution should be a reversible mapping from mention/candidate to canonical entity, suppression, or review state, with rule version, evidence, confidence, and manual overrides. A “Suppressed and ambiguous candidates” view would make the Clay/SaaS boundary inspectable and reversible.
