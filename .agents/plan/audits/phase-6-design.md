# Phase 6 — recommendation engine design

Produced 28 Jul 2026 for `phase-6-recommendation-engine`.

## Boundary

Phase 6 adds a durable, project-scoped work queue. It does not add a second
finding engine.

- On-page and technical candidates come only from the latest completed Site
  Audit's persisted `audit_issues`. The shared issue registry classifies each
  existing rule as `on_page` or `technical`; detection stays in the existing
  page and multipage reporters.
- Off-page candidates come from the Phase 5 competitor-source gap rule over the
  normalized tracked-answer corpus. The gap service is extended to resolve each
  qualifying domain to exact sanitized citation URLs and, where present, a
  concrete community such as `r/seo`.
- Report/share-link work and global restyling remain outside this phase.

## Persistence

Add the same four tables to D1/SQLite and Postgres in one migration pair.

### `recommendations`

The work item stores project ownership, category, generator/rule/score versions,
a stable fingerprint, a concrete target, the generated action and rationale,
workflow status, score summary, evidence counts/window, and lifecycle
timestamps.

`(project_id, fingerprint)` is unique. Fingerprints contain only stable action
identity:

- audit findings: issue rule plus canonical action destination (and a broken
  link target or duplicate cluster identity when the action requires it);
- citation gaps: the exact sanitized external URL.

Audit IDs, citation IDs, counts, windows, scores, and generated copy are excluded
from fingerprints. Regeneration can therefore refresh observations without
creating a new work item.

Status is `todo`, `done`, or `declined`. Regeneration never writes status or its
terminal timestamps. A deliberate user transition back to `todo` is the only
way a declined fingerprint can return to the active queue.

`is_active` describes whether the latest successful generation still produced
the candidate. All candidate upserts finish before older `last_generated_at`
rows are marked inactive, so a failed generation cannot empty the queue.
Inactive terminal items remain available as history; inactive todo items do not
surface as current work.

### Evidence tables

`recommendation_audit_issue_evidence` links a recommendation to a nullable
`audit_issues` FK and snapshots the source audit ID, issue type, severity, page
URL, and validated details. The FK uses `ON DELETE SET NULL`; deleting an audit
does not erase the evidence shown with an existing recommendation.

`recommendation_citation_evidence` links an off-page recommendation to a
nullable `ai_citations` FK and nullable competitor-brand FK. It snapshots the
source URL/hostname/title, answer ID, prompt, model, observed timestamp, and
competitor name. Source retention can keep pruning old runs without silently
removing the work item's explanation.

Both evidence tables have an immutable evidence fingerprint unique within the
recommendation. Current generation requires non-null source IDs and resolved
competitor associations; nulls only arise later through source retention.

### `recommendation_score_factors`

One row per versioned input stores a factor key, label, raw value, weight,
contribution, and short calculation explanation. The displayed score is the
rounded sum of contributions, clamped to 0–100. Levels are `high` at 70+,
`medium` at 40–69, and `low` below 40.

## Generation

Generation reads both evidence sources first, builds validated candidates, then
upserts each recommendation with its complete current evidence and score
factors.

Audit `details_json` is parsed by rule-specific Zod schemas before it can affect
a target, fingerprint, rationale, or score. Invalid historical details are not
trusted; the finding can still produce a page-level action only when the rule
does not require the invalid field. Rules such as `broken-internal-link` that
need a target URL are skipped when that target cannot be validated.

Audit scoring uses four visible factors:

- registry severity (45 points);
- target importance from crawl depth/start-page context (25 points);
- affected scope (10 points);
- completed-audit recency (20 points).

Off-page scoring uses:

- exact-page citation volume in competitor-mentioned answers (35 points);
- distinct competitor-mentioned answers (25 points);
- resolved competitor breadth (20 points);
- latest observation recency (20 points).

The off-page evidence builder applies Phase 5's same-domain exclusion: a domain
is eligible only when it is cited in at least one successful
competitor-mentioned answer and in zero successful primary-brand-mentioned
answers in the same half-open 30-day window. Candidate evidence contains every
qualifying citation/competitor association for the exact URL, plus exact
citation, answer, prompt, model, competitor, and observation counts.

## Service and UI

Authenticated project server functions expose:

- queue read;
- explicit regeneration;
- status transition.

The recommendation route presents Off-Page, On-Page, and Technical views with
Todo, Done, and Declined workflow filters. Cards lead with priority and concrete
destination, then show the generated action, rationale, evidence rows, and the
factor-by-factor score calculation. External targets open safely in a new tab;
site targets remain plain inspectable URLs.

The page follows `DESIGN.md` through the existing `.ai-visibility-page`,
`.ai-visibility-card`, and `--visibility-*` tokens. No token is renamed or
globalized.

## Verification

Tests must prove:

- every generated audit candidate has linked real audit-issue evidence;
- every generated off-page candidate has exact linked citations and resolved
  competitor evidence from a Phase 5-qualified gap;
- the score equals its visible factor contributions;
- Todo/Done/Declined transitions persist;
- regeneration refreshes evidence without resetting Done or Declined;
- a declined fingerprint never reappears in Todo;
- D1/Postgres schemas, FKs, enums, defaults, and unique constraints remain in
  parity;
- both migration histories apply and both generators report no drift;
- `ci:check` passes.
