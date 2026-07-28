# Phase 5 citation intelligence design

## Product surface and metric contract

Add a project-scoped **Citation Intelligence** page at
`/p/:projectId/citations`, linked beside AI Visibility under My Site. The page
uses the existing 7/30/90-day selector and Phase 2 period contract: adjacent UTC
half-open windows, `[asOf - N days, asOf)` and
`[asOf - 2N days, asOf - N days)`. All figures describe OpenSEO's retained,
observed tracked-answer corpus. They are not DataForSEO `top_pages` aggregates,
and sampled `mentions` prompts remain confined to Brand Lookup.

The current window shows:

- answer-level citation density: citation observations divided by successful
  stored answers;
- daily density only for dates with successful observations (observed zero
  citations is `0`; missing dates are omitted, never zero-filled);
- domain rollups and URL rollups ranked by citation count, with distinct citing
  answers and citations per successful answer; and
- a competitor-source gap report ranked by distinct competitor-mentioned
  answers, then citation count and domain.

URLs remain the sanitized observation keys stored by Phase 0. Read shaping
reuses `safeHttpUrl`, enforces the existing 2,048-character citation cap, and
derives hostname from the accepted URL rather than trusting stored/provider
domain text. A separate rollup key uses `tldts` with private suffix support to
derive the registrable domain; when no registrable domain exists, the sanitized
hostname is the explicit fallback. Thus `www` and ordinary subdomains group
together while tenants such as `site.github.io` remain distinct.

## Competitor-source gap definition

For one selected retained window, a domain enters the gap candidate set when it
is cited in at least one successful answer that has a resolved mention of an
active, non-primary tracked brand. The domain is removed if it is cited in even
one successful answer that has a resolved mention of the active primary brand.
Both inclusion and exclusion use the same derived rollup key. Multiple
competitor mentions in one answer do not multiply the answer count, but the UI
lists every observed competitor.

The UI says “sources cited in answers that mention competitors”; it does not
claim a cited page supports a particular brand statement because citations and
mentions provide answer-level co-occurrence, not span attribution. “Zero
citations of your brand” is explicitly scoped to the selected stored window.

## Domain taxonomy

Domain type is mutable reference metadata, never copied into immutable citation
rows. Add a normalized, project-scoped `ai_domain_classifications` table in both
dialects for reviewed manual overrides, keyed by project, domain, and match
scope. It records category, method, rule version, confidence, reviewer, and
timestamps. Phase 5 reserves D1 migration `0041` and Postgres migration `0018`
because parallel Phase 4 owns `0040`/`0017`.

Classification precedence is:

1. reviewed manual exact-host or registrable-domain override;
2. versioned curated exact/suffix registry;
3. narrow deterministic institutional suffix rules; and
4. `unknown`.

The taxonomy is `editorial`, `corporate`, `ugc`, `reference`,
`institutional`, and reviewed `other`; `unknown` means unclassified and is not
folded into `other`. The first registry version covers a small labelled set of
clear publishers/platforms, tracked brand domains as corporate, and
high-precision government/academic suffixes. It does not infer corporate versus
editorial from generic TLDs. Every row exposes the method and rule version. The
page explains that labels are domain-level defaults produced by maintained
rules and narrow heuristics, with unmatched domains left unclassified.

## Boundaries and implementation

A citation-intelligence repository performs provider-aware, project-scoped
reads of terminal runs/answers, citations, resolved mentions, active brands,
and reviewed classifications. A pure service shapes sanitized observations,
period rollups, taxonomy, density, and gap candidates. The server function
enforces project context; a read-only `get_ai_citation_intelligence` MCP tool
returns the same result without provider calls or credits.

The implementation does not alter citation ingest, the run workflow, mention
scoring/resolution, sentiment, rank, or Brand Lookup's authoritative
`top_pages`/sampled-`mentions` split. Classification failure cannot block ingest
or remove a citation from rollups or gaps.

## Verification

Seeded multi-period unit fixtures cover exact half-open boundaries, observed
zeroes versus missing days, domain/URL aggregation, private suffixes, and
citations-per-answer denominators. Gap fixtures prove that one primary-brand
co-occurrence excludes a domain while competitor-only domains remain ranked.
URL fuzz cases cover malformed and Unicode hosts, unsafe/credential schemes,
over-length inputs, IP/local fallbacks, fragments/query variants, and exact
length boundaries. Repository/schema parity and MCP authorization tests cover
both persistence and exposure, followed by the full `ci:check` gate.
