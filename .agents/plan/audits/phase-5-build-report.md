# Phase 5 citation intelligence build report

Produced 28 Jul 2026 for `phase-5-citation-intelligence`.

## Shipped

- A project-scoped Citation Intelligence page at
  `/p/$projectId/citations`, linked under **My Site** beside AI Visibility.
- 7, 30, and 90-day stored-corpus views using Phase 2's adjacent UTC half-open
  periods. Daily density includes observed zero-citation days and leaves dates
  without successful answers as chart gaps.
- Citation-density metrics across successful answers, plus ranked registrable
  domain and exact sanitized URL rollups. Domain/page/gap totals remain exact
  while rendered result lists are explicitly capped at the top 100.
- Private-suffix-aware domain keys through `tldts`; normal subdomains roll up,
  private tenants remain distinct, and IP/local/non-registrable hosts fall back
  to the sanitized hostname.
- A ranked competitor-source gap report. A domain enters when it is cited in a
  successful answer mentioning an active tracked competitor and is excluded
  after one cited answer mentioning the primary brand. Inclusion and exclusion
  use the same derived domain key.
- Explicit answer-level co-occurrence language. The product does not claim that
  a cited page supports a specific mention because stored citations have no
  span attribution.
- A normalized `ai_domain_classifications` table for reviewed project
  overrides, with category, hostname/registrable scope, method, rule version,
  confidence, reviewer, and timestamps. D1 migration
  `0041_many_captain_universe.sql` and Postgres migration
  `0018_wealthy_sunfire.sql` ship together, leaving Phase 4's reserved
  `0040`/`0017` slots free.
- A read-only `get_ai_citation_intelligence` MCP tool with project
  authorization and the same stored result. It performs no provider calls and
  spends no credits.
- The deterministic AI Visibility seed now writes citation observations and a
  real competitor-only source gap, so both analytics surfaces can be inspected
  without model calls.

## Classification contract

The taxonomy is editorial, corporate, UGC, reference, institutional, and
reviewed other; unknown is separate and visible. Classification precedence is:

1. a reviewed manual project override;
2. an active tracked-brand domain, labelled as that method;
3. a versioned maintained exact/suffix list;
4. narrow government/academic suffix heuristics; and
5. unclassified.

Model suggestions and unreviewed rows are not published as fact. The UI shows
values such as **Editorial · maintained list**, **UGC · maintained list**, or
**Unclassified**, exposes the rule version in context, and states that labels
are revisable domain-level defaults rather than verified page facts.

## Preserved boundaries

- Brand Lookup still gets ranked page metrics only from authoritative
  `top_pages` and prompt examples only from sampled `mentions`; Phase 5 does not
  merge that provider aggregate with tracked-answer observations.
- Citation reads reuse `safeHttpUrl`, enforce the existing 2,048-character
  storage boundary, derive hostname from the accepted URL, and preserve the
  exact URL for page rollups.
- Citation ingest, run execution/scoring, brand mention scoring/resolution,
  sentiment, and rank fields were not changed.

## Verified

- Seeded multi-period fixtures cover exact 7/30/90-day windows, inclusive start
  and exclusive end boundaries, successful zero-citation days, missing/failed
  days, domain and exact-URL rollups, density denominators, private suffixes,
  and the top-pages-versus-observation boundary.
- Gap fixtures prove that a domain cited with competitors is removed after one
  primary-brand co-occurrence, including across different hostnames under the
  same registrable domain.
- URL fuzz coverage includes malformed and Unicode hosts, unsafe schemes,
  credentials, exact and over-length inputs, query/fragment variants, private
  suffixes, IP addresses, and localhost fallback.
- Classification tests cover reviewed/unreviewed overrides, ignored model
  suggestions, maintained rules, tracked-brand domains, high-confidence
  institutional suffixes, and `.org` remaining unknown.
- MCP tests verify the stored result and reject a foreign project before the
  citation service runs.
- Schema parity: **184 assertions passed**.
- Full suite: **109 files passed, 893 tests passed, 4 environment-gated tests
  skipped**.
- Both migration generators report no remaining schema changes.
- The complete D1 history applied to an isolated store and exposed
  `ai_domain_classifications`.
- The complete Postgres history applied to a disposable Postgres 16 database
  and exposed `public.ai_domain_classifications`.
- Production client and SSR bundles: green.
- A 45-day local fixture wrote 984 answers, 1,151 resolved brand mentions, and
  2,680 citations. The live page rendered one ranked source gap, changed from
  642 observations at 30 days to 141 at 7 days, and displayed classification
  provenance.
- Light desktop, dark desktop, and 390px mobile screenshots were inspected.
  Mobile document width stayed exactly 390px with table overflow contained
  inside its cards. A pre-existing `local_noauth` session-endpoint 404 was
  recorded in `.agents/PAPERCUTS.md`; no citation route or server-function
  errors occurred.
- `pnpm run ci:check`: green, including Prettier, Knip, both TypeScript
  projects, and type-aware Oxlint.

## Exit gate

- [x] A ranked list of domains citing tracked competitors with zero citations
      of the primary brand
- [x] Domain-type classification method is stated in the UI
- [x] `ci:check` green

## Scope

Phase 6 was not started. Phase 5 adds no provider spend, background
classification call, citation attribution claim, or modification to the run
workflow.
