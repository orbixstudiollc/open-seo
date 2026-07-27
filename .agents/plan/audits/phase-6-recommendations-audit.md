# Phase 6 — recommendation engine audit findings (workspace: bangui)

Produced 27 Jul 2026 by the Phase 6 audit pass (GPT-5 Codex via Conductor).
Audit only: no product code was modified; this findings note is the only
workspace change.

---

## Executive finding

Site Audit already has one coherent issue pipeline. Its 27 issue types are
declared in a shared registry, emitted by per-page and cross-page reporters,
persisted as audit-scoped occurrence rows, and consumed by the audit UI, exports,
dashboard, and MCP. Phase 6 should keep that pipeline as the only source of
on-page and technical findings.

The existing rows are not themselves a durable work queue. They belong to one
audit, are deleted with that audit, receive a new ID on every new audit, and have
no priority or Todo / Done / Declined state. Putting workflow state on
`audit_issues` would lose declines on regeneration. The safe extension is a
project-scoped recommendation projection that:

- derives on-page and technical items from real `audit_issues`;
- uses a stable fingerprint independent of `audit_id`;
- links each technical item to the issue occurrences that produced it;
- links each off-page item to the future normalized `ai_citations` rows that
  produced the Phase 5 gap;
- stores evidence and score inputs separately from mutable workflow state.

Off-page targets must not be inserted into `audit_issues` with a null `page_id`.
An external Reddit thread, publication, or community is an action destination,
not a crawled project page, and doing so would pollute Site Audit counts, exports,
and MCP output.

## Existing Site Audit issue pipeline

```text
crawlPage / audit_pages + audit_links
            │
            ├─ runPageReporters (during each crawl batch)
            └─ runMultipageChecks (during finalization)
                            │
                     DetectedIssue[]
                            │
              AuditRepository.insertIssues
                            │
                       audit_issues
             ┌──────────────┼──────────────┐
             │              │              │
       Audit results    Dashboard card   MCP report
       UI + exports
```

### Definition and detection

- [`src/shared/audit-issues.ts`](../../../src/shared/audit-issues.ts) is the
  canonical registry. It defines 27 stable string keys and, for each key,
  `severity`, `title`, `explanation`, and `howToFix`. `AuditIssueType` is derived
  from those keys. The file is shared by the detector, persistence layer, client,
  export, dashboard, and MCP.
- [`src/server/lib/audit/issues/page-reporters.ts`](../../../src/server/lib/audit/issues/page-reporters.ts)
  defines the occurrence contract:
  `issueType`, nullable `pageId`, required `pageUrl`, optional `details`, and an
  optional `dedupeKey`. It emits page-local findings from a normalized
  `CrawledPageResult`; it does not parse the DOM itself.
- [`src/server/lib/audit/issues/multipage.ts`](../../../src/server/lib/audit/issues/multipage.ts)
  and
  [`multipage-checks.ts`](../../../src/server/lib/audit/issues/multipage-checks.ts)
  emit duplicate, broken-link, redirect-chain/loop, and orphan findings over the
  persisted crawl graph.
- Per-page checks run in
  [`siteAuditWorkflowCrawl.ts`](../../../src/server/workflows/siteAuditWorkflowCrawl.ts)
  immediately after a batch is crawled. Cross-page checks run in
  [`siteAuditWorkflowPhases.ts`](../../../src/server/workflows/siteAuditWorkflowPhases.ts)
  during finalization. New technical detection belongs in one of these two
  reporter paths, not in a recommendation service.

### Persistence

- [`src/db/audit.schema.ts`](../../../src/db/audit.schema.ts) and
  [`src/db/pg/audit.schema.ts`](../../../src/db/pg/audit.schema.ts) define the
  same `audit_issues` shape for SQLite/D1 and Postgres:
  `id`, `audit_id`, nullable `page_id`, `page_url`, `issue_type`, `severity`, and
  nullable `details_json`.
- `audit_id` and `page_id` cascade on delete. An issue is therefore an immutable
  observation inside a particular audit, not a project-lifetime task.
- `issue_type` is plain text rather than a database enum. Unknown historical
  values remain readable through client/MCP fallbacks, while current writes are
  type-checked against the shared registry.
- [`AuditRepository.insertIssues`](../../../src/server/features/audit/repositories/AuditRepository.ts)
  copies severity from the registry, serializes type-specific details, and
  derives an id from
  `(auditId, pageUrl, issueType, dedupeKey)`. Inserts use
  `ON CONFLICT DO NOTHING`, making workflow retries idempotent.
- The stable row id is only stable within one audit because `auditId` is part of
  it. A later audit of the same URL produces a different issue id.
- There is no issue timestamp, project id, category, priority, resolution state,
  assignee, or cross-audit identity. Project ownership is reached through the
  parent `audits` row.

One retry caveat matters to recommendation generation: page rows are updated when
a crawl step retries, but previously inserted issue rows are not reconciled or
deleted if the retried fetch no longer emits them. Recommendations should be
generated only after a completed audit and should retain the source audit id so
this rare discrepancy is inspectable.

### Read and render paths

- [`AuditRepository.getAuditResultsForProject`](../../../src/server/features/audit/repositories/AuditRepository.ts)
  reads all pages, Lighthouse rows, and issue occurrences after checking that the
  audit belongs to the project.
- [`AuditService.getResults`](../../../src/server/features/audit/services/AuditService.ts)
  returns the raw inferred rows through the authenticated
  [`getAuditResults`](../../../src/serverFunctions/audit.ts) server function.
  The audit route waits until the run is complete before requesting results.
- [`IssuesView.tsx`](../../../src/client/features/audit/results/IssuesView.tsx)
  groups occurrences by `issueType`, orders groups by registry severity and
  occurrence count, renders the current registry explanation/remediation, and
  expands to affected URLs plus a generic rendering of `detailsJson`.
- [`ResultsView.tsx`](../../../src/client/features/audit/results/ResultsView.tsx)
  uses issue occurrences for the total and severity strip.
  [`PagesTable.tsx`](../../../src/client/features/audit/results/PagesTable.tsx)
  also consumes `missing-title` issue rows to distinguish a real finding from a
  non-HTML page that legitimately has no title.
- [`export.ts`](../../../src/client/features/audit/results/export.ts) exports
  severity, registry title, affected URL, raw/parsed details, and registry
  `howToFix` to CSV, JSON, or Sheets.
- [`auditSummaryQueries.ts`](../../../src/server/features/audit/repositories/auditSummaryQueries.ts)
  counts distinct affected URLs per type for the dashboard. The dashboard shows
  the latest audit's top three types.
- [`site-audit-tools.ts`](../../../src/server/mcp/tools/site-audit-tools.ts)
  filters and severity-sorts the same persisted rows, then adds registry title
  and `howToFix` to the structured MCP result.

The consumers do not currently agree on count semantics. The results UI and MCP
count issue rows, while the dashboard counts distinct affected URLs. A page with
three broken links is three occurrences but one affected page; `IssuesView`
currently labels the occurrence count as “pages.” Priority scoring must carry
both `occurrenceCount` and `affectedPageCount` and must not silently choose one.

The registry is live presentation metadata, not an audit-time snapshot:
`IssuesView` lets the current registry severity override the persisted value and
all consumers use current title/fix copy. That is convenient for correcting copy,
but a recommendation should snapshot the generated action/rationale and record
its generator version so its historical priority remains explainable.

## Where recommendations should extend the pipeline

Use `audit_issues` as the evidence/source layer and add a project-scoped work
queue as a derived layer.

1. Add recommendation classification metadata to the shared issue registry (for
   example `on_page` versus `technical`) rather than maintaining a second list of
   technical rules.
2. Generate technical/on-page candidates from a completed audit's persisted
   issue rows. Reuse registry title, explanation, `howToFix`, and severity; parse
   each rule's `detailsJson` through a rule-specific Zod schema before using it
   to construct a target or score.
3. Give every candidate a cross-run fingerprint derived from the rule and
   canonical action target, not from `auditIssue.id`. Examples:
   `(missing-title, pageUrl)`,
   `(broken-internal-link, sourceUrl, targetUrl)`, or a duplicate cluster's
   canonical member set.
4. Upsert by `(projectId, fingerprint)`. Refresh last-seen evidence and score,
   but never overwrite a terminal `done` or `declined` state during regeneration.
5. Link the recommendation back to every supporting `audit_issues` row. Do not
   re-run technical checks or infer technical findings from AI data.

Severity can be one priority input, but it is not a priority score. Severity is
static per issue type; priority also needs scope, recency, target importance, and
the explicit contribution of each factor.

## Off-page attachment point

The current AI Search path cannot provide durable evidence:

- [`brandLookup.ts`](../../../src/server/features/ai-search/services/brandLookup.ts)
  is explicitly stateless and writes only to R2 cache.
- [`citedSources.ts`](../../../src/server/features/ai-search/services/citedSources.ts)
  ranks sanitized DataForSEO `top_pages` rows, then attaches sample prompt
  examples from `mentions`. Its returned rows contain URL/domain/platform and
  aggregate metrics, but no database citation IDs, answer IDs, resolved
  competitor IDs, project lineage, or observation window.
- The split is deliberate: page metrics from `top_pages` are authoritative for
  that lookup, while attached prompts are sample examples. Recommendation
  evidence must preserve that distinction instead of presenting sampled prompts
  as the full cause of an aggregate.

Phase 0's earlier audit design proposes normalized `ai_runs`, `ai_answers`,
`ai_brand_mentions`, `ai_brands`, and `ai_citations`, but none of those tables is
present in this checkout yet. Phase 5 therefore has to land before off-page
recommendations can satisfy the evidence gate.

The Phase 5 gap query should return more than an aggregate display row. Its
service contract needs:

- a sanitized concrete `targetUrl` and hostname (plus community key such as a
  subreddit when classification can derive one);
- the exact `citationIds` behind the observed competitor citations;
- the resolved `competitorBrandIds` associated with those citations' answers;
- window start/end and first/last observed timestamps;
- observed citation, distinct-answer, and distinct-prompt counts;
- the target brand's citation count for the same scope, asserted to be zero;
- platform/model distribution;
- domain-type value, classification method/version, and confidence where
  applicable.

The attachment chain should be:

```text
recommendation (project + concrete destination)
  └─ recommendation_citation_evidence
       ├─ ai_citation ── ai_answer ── ai_run(project, observed period)
       └─ ai_brand (resolved competitor that made the citation gap relevant)
```

If Phase 5 materializes gap-report rows, Phase 6 may also reference the gap row,
but that reference cannot replace the raw citation links. An aggregate saying
“54 citations” without the 54 source citation IDs cannot pass Phase 6's evidence
test.

## Proposed recommendation and evidence schema

Names are illustrative; the relational boundaries are the important part.

### `recommendations`

| Field                                                                           | Purpose                                                                     |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`, `project_id`                                                              | Project-owned work item.                                                    |
| `category`                                                                      | `off_page`, `on_page`, or `technical`.                                      |
| `rule_key`, `generator_version`                                                 | Stable generator identity and versioned behavior.                           |
| `fingerprint`                                                                   | Stable cross-regeneration identity; unique with `project_id`.               |
| `target_kind`                                                                   | `site_page`, `external_url`, `domain`, or `community`.                      |
| `target_url`, `target_hostname`, `target_label`                                 | Sanitized concrete action destination. Off-page rows require a URL.         |
| `title`, `action`, `rationale`                                                  | Audit-time snapshot of what to do and why.                                  |
| `status`                                                                        | `todo`, `done`, or `declined`; default `todo`.                              |
| `priority_level`, `priority_score`, `score_version`                             | Display priority plus reproducible scoring version.                         |
| `evidence_window_start`, `evidence_window_end`, `evidence_as_of`                | Scope of the supporting observations.                                       |
| `occurrence_count`, `affected_page_count`                                       | Technical/on-page scope with unambiguous semantics.                         |
| `citation_count`, `answer_count`, `prompt_count`, `target_brand_citation_count` | Off-page evidence summary; the last value is zero for a generated gap item. |
| `first_observed_at`, `last_observed_at`                                         | Recency inputs shown to the user.                                           |
| `created_at`, `last_generated_at`, `updated_at`, `done_at`, `declined_at`       | Workflow and regeneration history.                                          |

Relational IDs must not be stored as JSON arrays on this row.

### `recommendation_audit_issue_evidence`

- `recommendation_id`
- `audit_issue_id`
- unique `(recommendation_id, audit_issue_id)`
- an audit-time snapshot of `audit_id`, `issue_type`, `page_url`, and validated
  details, or a deliberate retention rule that prevents the evidence audit from
  being deleted

Every on-page/technical recommendation must have at least one row here. The
snapshot is important because users can currently delete an audit and its issue
rows cascade.

### `recommendation_citation_evidence`

- `recommendation_id`
- `citation_id`
- `competitor_brand_id`
- `evidence_role` (initially `competitor_source`)
- unique `(recommendation_id, citation_id, competitor_brand_id)`
- source URL, hostname, title, prompt/model, and observed-at snapshots if citation
  retention is shorter than recommendation retention

Every off-page recommendation must have at least one row here and at least one
resolved competitor association. The citation FK should be non-null when the
recommendation is generated.

Phase 0's audit proposed pruning run detail after 400 days. Because citations
would normally cascade from answers/runs, Phase 6 must choose one explicit
long-term behavior before build:

- retain source runs while a recommendation references them; or
- use a nullable citation FK with `ON DELETE SET NULL` and preserve immutable
  evidence snapshots in the join row.

The second option preserves the visible evidence without making an action item
silently defeat the corpus retention policy. Copying immutable source fields for
this purpose is historical snapshotting, not a parallel source of truth.

### `recommendation_score_factors`

- `recommendation_id`
- `factor_key`
- `raw_value`
- `weight`
- `contribution`
- short user-facing explanation
- unique `(recommendation_id, factor_key)`

This makes a score such as “high because 54 citations across 31 answers named
three competitors in the last 30 days” reproducible instead of a black box.

## Required generation invariants

| Recommendation category | Required evidence                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On-page / technical     | Latest completed project audit, at least one linked real `audit_issue`, validated rule details, and a stable target fingerprint.                                                               |
| Off-page                | Concrete sanitized external destination, at least one linked `ai_citation`, at least one resolved competitor association, a defined window, and zero target-brand citations in the same scope. |
| All                     | Versioned rationale and score factors; regeneration updates evidence without resetting `done`/`declined`.                                                                                      |

## Build-time risks to resolve after the audit gate

- Phase 0/5 persistence is absent, so the off-page half is blocked until the
  normalized citation corpus and gap-query contract exist.
- The existing schema parity test does not include the audit schema modules even
  though the provider-aware schema barrel includes them. Any Phase 6 table/FK
  touching audit data needs explicit SQLite/Postgres parity coverage.
- `details_json` is intentionally type-specific but has no shared runtime schema.
  Recommendation generation must validate it; the generic UI's best-effort JSON
  rendering is not a safe generator contract.
- Current issue occurrence counts and distinct-page counts differ. Both should be
  carried and named, especially when they feed priority.
- A recommendation fingerprint must exclude volatile inputs such as audit id,
  evidence window, counts, and score. Including any of those would recreate
  declined items on the next generation.
- Technical evidence retention must be decided alongside audit deletion, and
  citation evidence retention alongside Phase 0's proposed 400-day pruning.

With those boundaries, Phase 6 can present one Off-Page / On-Page / Technical
work queue while keeping its two evidence sources honest: real crawler findings
for the site's own pages and exact stored citations for external opportunities.
