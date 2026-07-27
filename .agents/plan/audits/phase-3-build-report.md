# Phase 3 brand resolution — build report

## Shipped

- A project-scoped brand resolver implementing the audited precedence exactly:
  manual decision → verified registry → generic classification → ambiguous
  review → clustering suggestions only.
- An immutable-observation model. `ai_brand_mentions` is never rewritten during
  resolution; canonical, suppressed, review, and unresolved states are
  projections through a separate mapping ledger.
- Append-only `ai_brand_resolution_rules` and relational
  `ai_brand_resolution_evidence` tables in SQLite/D1 and Postgres, with one
  active rule per project/candidate and linked supersession history.
- Atomic rule replacement across both runtime providers. Merge, split, restore,
  suppress, and review decisions retain the prior rule, actor, reason, version,
  evidence, and confidence.
- Conservative automatic resolution. Exact reviewed canonical names and aliases
  resolve; exact generic taxonomy terms are suppressed; generic-like names
  without verified registry evidence go to review; name-family clustering only
  proposes a merge.
- Canonical grouping that rolls all resolved aliases into one brand row while
  retaining every raw variant. This groups Clay/Clay Global, the four Figma
  variants, the Lazarev variants, and the Wavespace variants without folding
  Brix into unrelated agencies.
- A Brand Resolution project page following `DESIGN.md`, with Review,
  Suppressed, and Resolved views; evidence, confidence, and rule version;
  explicit merge/suppress/review decisions; restore; and per-variant split.
- Read-only `get_brand_resolution_state` and reversible
  `manage_brand_resolution` MCP tools with project authorization, bounded
  output, actor attribution, and no paid provider calls.
- A surgical `detectTarget` fix: the existing dot/no-whitespace branch now
  requires the shared public-suffix validator. Valid domains behave as before;
  `Lazarev.` and fake suffixes remain keywords.

## Exit gate

- [x] **`SaaS` and `AI` never appear as brands.** Both resolve to persisted
      `suppressed` rules from the versioned generic taxonomy and are excluded
      from canonical grouping. The corpus engine test, SQLite service test, and
      browser review all verify this.
- [x] **Clay / Clay Global resolve to one row.** Both map to the reviewed Clay
      registry entity, and the canonical projection emits one Clay row with both
      raw variants and their combined mention count.
- [x] **Merge is reversible with no mention loss.** The SQLite integration test
      snapshots mention IDs, raw names, normalized names, and counts; performs
      merge then split; and proves the snapshot is byte-for-byte equivalent
      afterward. The superseded mappings remain in history.
- [x] **`ci:check` green.** Passed on 27 Jul 2026 after the final changes.

## Verification

- Brief corpus: all checked-in examples pass, including generic suppression,
  exact registry aliases, product-family aliases, ambiguous `Agency A/B/C`,
  and preservation of Brix as a separate brand.
- Focused resolver/repository/parity run: 181 assertions passed.
- Full suite: 97 files passed; 814 tests passed; one environment-gated Postgres
  integration test skipped.
- Schema parity: 176 assertions passed across 45 tables.
- SQLite: the complete local migration history through
  `0038_chemical_hellcat.sql` applied successfully; the real repository
  merge/split contract passed against LibSQL.
- Postgres: `0015_rare_scrambler.sql` generated from the matching hand-written
  schema; parity and type checks passed. No Postgres URL was supplied for the
  optional live integration run.
- `db:generate:d1` and `db:generate:pg`: no schema changes remaining.
- Production Vite client and SSR build: passed.
- Browser workflow: refresh, suppressed queue, canonical alias grouping,
  clustering review, manual merge acceptance, and the resulting canonical row
  all passed in headless Chromium. The rendered Clay row retained `Clay` and
  `Clay Global`; the suppressed view retained `SaaS` and `AI` for inspection.
- Existing `detectTarget`, share-of-voice, and brand-lookup regression set: 26
  assertions passed.
- Final `pnpm run ci:check`: green.

## Corpus note

The brief states that the incumbent had 26 duplicate groups but does not list
all 26 groups or every member of the cited sixteen-entry group. As the audit
noted, inventing those missing observations would not be a valid gate. The
fixture therefore covers every concrete member checked into the brief and
encodes the required behavior for the omitted classes: verified aliases
resolve, exact generic terms suppress, generic conflicts go to review, and
clustering cannot auto-merge.

## Checkpoints

- `1f8f37e` — design note
- `811815c` — public-suffix target detection
- `c69dfd2` — dual-dialect reversible ledger
- `4c2942a` — resolver, repository, corpus, and zero-loss tests
- `762a944` — review UI and MCP workflow
- `bf26a10` — repository formatting gate restored

Phase 4 was not started.
