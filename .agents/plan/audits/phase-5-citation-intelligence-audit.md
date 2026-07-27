# Phase 5: citation intelligence audit findings (workspace: semarang)

Produced 27 Jul 2026. Audit-only pass; no product code was modified. This findings note is the only workspace change.

---

## Executive recommendation

Use a **versioned, deterministic classification registry** with manual overrides as the source of truth for domain type. Apply only narrow, high-confidence rules from that registry and leave unmatched domains explicitly `unknown`. A model may generate suggestions for human review; it should not classify citations during ingest.

Keep citation observations factual and immutable in Phase 0's proposed `ai_citations` table: sanitized URL, derived hostname, bounded title, and source order attached to an answer. Domain type is mutable metadata and should be normalized separately, with its method and rule version recorded. Do not copy a current guess into every citation row as if it were observed fact.

The Phase 5 taxonomy also needs one correction before implementation. The build section lists editorial / corporate / UGC / reference / institutional, while the reference distribution includes `Other` at 5%. Add `other` for a reviewed classification that fits none of the five, and keep `unknown` separate for a domain that has not been classified.

## Existing URL and hostname sanitisation

[`safeHttpUrl`](src/server/features/ai-search/safeUrl.ts:13) is a link-safety allow-list:

- Rejects null, undefined, non-string, and empty input.
- Requires `new URL(value)` to parse successfully.
- Accepts only `http:` and `https:`. This rejects `javascript:`, `data:`, `vbscript:`, `file:`, FTP, and other schemes.
- Rejects URLs containing either a username or password, including username-only `user@host` forms.
- Returns the original string unchanged after validation.

The helper does **not** trim, canonicalize, or impose a length cap. It does not remove fragments, sort query parameters, normalize HTTP to HTTPS, collapse trailing slashes, remove default ports, or reject localhost, IP literals, private addresses, and non-registrable hosts. Syntactically different URLs therefore remain different citation keys.

[`safeHostname`](src/server/features/ai-search/safeUrl.ts:31):

- Reuses `safeHttpUrl`, so it inherits the same scheme and credential checks.
- Extracts `URL.hostname`, which excludes credentials and ports.
- Removes one leading `www.`.
- Preserves every other subdomain; `news.example.com` does not become the registrable domain `example.com`.
- Returns null when the input is rejected or cannot be parsed.

The existing [`tldts`](package.json:113) dependency can derive and validate a registrable domain, including public/private suffix handling, but `safeHostname` deliberately does not do that. Phase 5 should retain both concepts: the sanitized source hostname for fidelity and an explicitly derived registrable-domain rollup key. It must not silently change `safeHostname` semantics.

[`deriveCitedSources`](src/server/features/ai-search/services/citedSources.ts:28) adds the output caps and source-specific shaping:

- A `top_pages` row is dropped unless its key passes `safeHttpUrl` and is at most 2,048 characters.
- The displayed domain is always derived with `safeHostname`; an upstream `source.domain` is never trusted.
- Mention questions must be non-empty strings and are truncated to 500 characters.
- Mention source URLs pass `safeHttpUrl`. There is no local length check in the mention map, but only an exact match to a retained, length-capped `top_pages` URL can reach the output.
- Repeated examples for the same platform, exact URL, and truncated question are deduplicated; the first sampled volume wins.
- Duplicate `top_pages` rows are not deduplicated; each valid provider row can reach the output.
- Example volumes and page metrics are rounded with `roundOrNull`; missing metrics remain null.
- Examples sort by sampled AI search volume, with null treated as zero, then are capped per source.
- Source rows are capped **per platform** by captured volume before the combined list is sorted. A high-volume Google result set therefore cannot eliminate ChatGPT rows.

The current tests cover unsafe schemes, credentials, invalid input, hostname derivation, exact-URL prompt attachment, and ignoring an upstream domain that disagrees with the URL. Phase 5's required fuzz pass still needs cases for over-length URLs, malformed/Unicode hosts, credential variants, fragments and query variants, IP/local hosts, exact-match near misses, per-platform caps, question truncation collisions, and duplicate `top_pages` rows.

## The `top_pages` versus `mentions` split

The split in [`citedSources.ts`](src/server/features/ai-search/services/citedSources.ts:20) defines data authority and must remain intact:

- `top_pages` creates every ranked source row and supplies its page-level `mentions` and `ai_search_volume`. Those are the authoritative provider aggregates.
- `mentions` is fetched as a sample of at most 100 rows per platform. It can only add example prompts and their sampled volume to a source row that already exists.
- The join key is the exact string `platform::url`. There is no cross-platform join and no URL canonicalization.
- A `mentions` URL absent from `top_pages` never becomes a ranked source. If `top_pages` fails but `mentions` succeeds, the platform produces no source rows. If `mentions` fails but `top_pages` succeeds, authoritative rows remain with empty prompt examples.
- The first cap is per platform, then the combined rows are ordered by captured volume and mention count. This preserves platform coverage while keeping the default leaderboard useful.

Do not rebuild Brand Lookup page metrics from the mention sample, and do not label sampled prompts as exhaustive. Conversely, Phase 0's `ai_citations` rows support an exact rollup over the answers OpenSEO itself has observed. That is a different metric with a different denominator. It should be labelled as an **observed tracked-answer corpus**, not merged with or presented as DataForSEO's `top_pages` aggregate.

The current DataForSEO response shaping exposes URL/domain aggregates but no publisher-type field. Its documentation now marks [`top_pages/live`](https://docs.dataforseo.com/v3/ai_optimization-llm_mentions-top_pages-live/) as legacy in favor of `top_mentioned_pages/live`; the replacement response still provides citation metrics, not the editorial/corporate/UGC taxonomy. DataForSEO Labs' [“categories for domain” endpoint](https://docs.dataforseo.com/v3/dataforseo_labs-google-categories_for_domain-live/) is also not a substitute: it returns Google product/service categories inferred from ranking keywords, not publisher type.

## Phase 0 storage and rollup implications

Phase 0's proposed `ai_citations` shape is the correct observation target, with these boundaries:

- Apply `safeHttpUrl` at ingest **and** enforce the 2,048-character storage cap explicitly; the helper alone does not cap length.
- Derive hostname from the accepted URL rather than trusting provider-supplied domain text.
- Bound title at the service boundary and retain source order.
- Preserve the accepted URL rather than overwriting it with a rollup canonical form.
- Derive a separate registrable-domain key with `tldts` for grouping. Keep hostname as well so exact-host overrides and multi-tenant platforms remain possible.
- Keep `top_pages` mention/volume aggregates out of `ai_citations`; they have no answer identity or source order and are not citation observations. Persist them only in a separately identified provider-snapshot structure if longitudinal Brand Lookup aggregates become a requirement.

Domain classification is revisable reference data. Prefer a normalized domain-classification record keyed by hostname/registrable-domain rule, carrying category, match scope, method (`manual`, `curated_rule`, or `model_suggestion`), rule/model version, confidence where applicable, and review timestamps. Citation ingest must succeed when classification is missing or its service is unavailable.

A citation and a brand mention are both attached to an answer, without a direct relationship to each other. Their join proves **answer-level co-occurrence** only. Unless citation spans or another attribution signal are stored, the gap report must say “sources cited in answers that mention the competitor” and avoid claiming that a particular page supports a particular brand statement.

“Never cites you” must also be scoped. With the proposed 400-day retention period it can only mean zero qualifying co-occurrences in the selected retained window. Use one documented domain key for both the competitor inclusion and target exclusion sets; otherwise `www`, language subdomains, or private-hosting variants can create false gaps.

## Domain-type classification options

| Option | Strengths | Failure modes |
|---|---|---|
| Maintained registry | Deterministic, cheap, testable, inspectable, versionable, and easy to override. Exact host, registrable-domain, and suffix rules can have explicit precedence. | Long-tail coverage starts low; ownership and site purpose change; the list requires stewardship; a single domain can host mixed content or many tenants. |
| URL/domain heuristic | Fast and useful for narrow signals such as reviewed UGC platforms or institutional suffix rules. No provider dependency. | Hostnames do not reliably distinguish corporate from editorial; `.org` is not institutional, `.edu` is US-specific, path tokens are easy to misread, international domains vary, and hybrid sites break one-label rules. Broad heuristics create confident-looking false facts. |
| Model call | Can use title, snippet, and page context for long-tail candidates and ambiguous domains. | Adds cost, latency, outages, nondeterminism, model drift, and data egress. Page content introduces prompt-injection risk. A model may confidently invent publisher identity, and reclassification can change historical buckets without an auditable rule. |

Every approach inherits the domain-versus-page mismatch. Corporate sites publish editorial blogs; news sites host community comments; YouTube, Reddit, Medium, GitHub, and Substack mix platform ownership with user-authored content; university and government domains can publish reference material. The product should describe the value as a **domain-level default**, allow an exact-host or URL-level override when needed, and show its provenance.

## Recommended decision hierarchy

1. A reviewed project/manual override wins.
2. A versioned curated registry matches exact host, then private-suffix-aware registrable domain, then an explicit suffix/platform rule.
3. A small set of high-precision deterministic rules may classify clear institutional or known platform cases.
4. Everything else remains `unknown` and stays visible in reports.
5. Optionally run a model asynchronously to propose a category for high-volume unknowns. Store the proposal, evidence, model, prompt version, and confidence; do not publish it as fact until reviewed or promoted into the registry.

The UI should show both category and method, for example “UGC · curated rule,” “Corporate · manual,” or “Unclassified,” and explain that the label applies at domain level. A classification failure must never block citation ingest, alter counts, or remove a source from the gap report.

Before implementation, define the taxonomy boundaries with a small labelled gold set containing corporate blogs, independent publications, government/university sites, Wikipedia/reference sites, Reddit/YouTube/Medium/Substack, documentation sites, and multi-tenant hosts. Measure precision and unknown coverage separately. The safe default is high precision with visible unknowns, not forced 100% coverage.

## Required preservation rules

The Phase 5 gate is feasible on top of `ai_citations` if it preserves three distinctions:

1. Sanitized observation URL versus derived rollup domain.
2. Authoritative `top_pages` aggregates versus sampled `mentions` examples versus OpenSEO's own tracked-answer counts.
3. Observed citation facts versus revisable domain-type classifications.
