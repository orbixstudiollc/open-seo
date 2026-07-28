# Phase 6 recommendation engine build report

Produced 28 Jul 2026 for `phase-6-recommendation-engine`.

## Shipped

- A durable, project-scoped Recommendations page at
  `/p/$projectId/recommendations`, linked under **My Site**. The queue has
  Off-Page, On-Page, and Technical views plus Todo, Done, and Declined workflow
  filters.
- On-page and technical recommendations sourced only from the latest completed
  Site Audit. The existing shared issue registry now classifies every current
  audit rule; the existing reporters remain the sole finding engine.
- Exact off-page targets derived from Phase 5's 30-day competitor-source gap
  rule. Qualifying domains resolve to specific sanitized citation URLs and
  named communities such as `r/seo`, while retaining the same primary-brand
  domain exclusion.
- Evidence-first recommendation cards. Each generated item names a concrete
  destination, action, rationale, evidence window and counts, and linked
  citation or audit-finding records. Source snapshots remain inspectable after
  ordinary source retention deletes the original row.
- Explainable 0–100 priority scores with stored, versioned factors. Audit items
  show severity, target importance, scope, and recency; off-page items show
  citation volume, answer volume, competitor breadth, and recency.
- Stable recommendation fingerprints that exclude volatile evidence IDs,
  counts, windows, scores, and copy. Regeneration refreshes observations
  without duplicating the work item or overwriting its workflow state.
- Todo, Done, and Declined transitions with terminal timestamps. Declined
  fingerprints stay Declined across regeneration and never return to Todo
  unless a user explicitly changes their state.
- Authenticated project server functions for queue reads, regeneration, and
  state changes, backed by a service and provider-aware repository.
- Four normalized tables in both dialects:
  `recommendations`, `recommendation_audit_issue_evidence`,
  `recommendation_citation_evidence`, and `recommendation_score_factors`.
  D1 migration `0042_boring_weapon_omega.sql` and Postgres migration
  `0019_pale_smiling_tiger.sql` ship as the same logical change.

## Evidence and regeneration contract

- A generated audit recommendation contains one or more real
  `audit_issues` links. Rule-specific Zod schemas validate `details_json`
  before details can influence the target, fingerprint, rationale, or score.
  A rule that needs an invalid target, such as a malformed broken-link URL, is
  skipped.
- A generated off-page recommendation contains the exact qualifying
  `ai_citations` links, answer and tracked-prompt context, model and observation
  timestamps, and resolved competitor associations. The UI preserves Phase
  5's answer-level co-occurrence caveat and makes no span-attribution claim.
- Evidence FKs use `ON DELETE SET NULL` while preserving source snapshots.
  Evidence replacement happens only after the current generation is written.
- `(project_id, fingerprint)` is unique. Candidate upserts do not write
  `status`, `done_at`, `declined_at`, or `created_at`. Only rows absent from a
  successfully completed generation become inactive; inactive terminal rows
  remain visible as history.
- Every stored score equals the rounded, clamped sum of its displayed factor
  contributions. High is 70+, medium is 40–69, and low is below 40.

## UI and scope

- The page follows `DESIGN.md` with the existing `.ai-visibility-page`,
  `.ai-visibility-card`, and `--visibility-*` tokens. No token was renamed or
  globalized.
- Priority, destination, action, and rationale lead each card. Score factors
  and evidence are expandable, and state changes remain available without
  hiding the item's source.
- Reports, share links, and existing-page restyling were not changed.

## Verified

- Recommendation engine tests prove every audit candidate has linked
  audit-issue evidence, every off-page candidate has exact citation and
  competitor evidence, malformed target details are rejected, visible factor
  contributions sum to the score, and fingerprints remain stable while
  observations change.
- Repository integration tests prove Todo → Done → Declined → Todo
  round-trips, regeneration preserves a Declined status while refreshing
  generated copy, the item does not reappear in Todo, and audit evidence
  snapshots survive deletion of the source finding.
- Focused Phase 6 suite: **4 files passed, 233 tests passed**.
- Full suite: **115 files passed, 958 tests passed, 4 environment-gated tests
  skipped**.
- Schema parity: **224 assertions passed**, including the existing Site Audit
  schema and all recommendation tables.
- Both migration generators report no remaining schema changes.
- The complete D1 history through `0042` applied to an isolated store and
  exposed all four recommendation tables.
- The complete Postgres history through `0019` applied to a disposable
  Postgres 16 database and exposed all four tables with all seven evidence,
  factor, and project FKs.
- Production client and SSR bundles: green.
- Browser verification generated a real recommendation from a seeded completed
  Site Audit, displayed its exact page, linked audit evidence, and visible
  91/100 factor calculation, then declined and regenerated it without
  resurfacing it in Todo.
- Desktop and 390px mobile rendering were inspected. The prescribed canvas and
  accent tokens resolved to `#f7f7f4` and `#f54e00`; document width matched
  viewport width at both sizes. No Phase 6 console or HTTP failures occurred.
  The already-recorded local-auth session 404 and local `AUTH_MODE` setup
  papercuts were not duplicated.
- `pnpm run ci:check`: green, including Prettier, Knip, both TypeScript
  projects, and type-aware Oxlint.

## Exit gate

- [x] A prioritized action list where each item names a concrete destination
      and the evidence that produced it
- [x] Declined items stay declined across regeneration
- [x] Technical recommendations come from real Site Audit findings
- [x] `ci:check` green

## Scope

Phase 7 and Phase 8 were not started. Phase 6 does not add a parallel audit
pipeline, provider spend, report/share-link behavior, or global visual-system
changes.
