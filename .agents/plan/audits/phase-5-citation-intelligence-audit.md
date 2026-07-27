# Phase 5 — citation intelligence audit findings (workspace: semarang)

Produced 27 Jul 2026 by the parallel audit pass (GPT-5.6 Sol via Conductor). Read-only.

---

Audit complete. The findings note is at [phase-5-citation-intelligence-audit.md](.agents/plan/audits/phase-5-citation-intelligence-audit.md).

Key conclusions:

- Preserve `top_pages` as authoritative metrics and `mentions` as sampled prompt enrichment.
- Use a versioned maintained registry with manual overrides; keep heuristics narrow and model classifications review-only.
- Separate `other` from `unknown`.
- Store factual citation observations in `ai_citations`; keep mutable domain classification normalized separately.
- `safeHttpUrl` validates schemes and credentials but does not canonicalize or enforce length limits.
- Phase 0 supports answer-level citation/brand co-occurrence, not semantic attribution between a specific source and brand claim.
- Current DataForSEO documentation marks `top_pages` as legacy, while its replacement still provides metrics rather than publisher-type classification. [Official documentation](https://docs.dataforseo.com/v3/ai_optimization-llm_mentions-top_pages-live/)

No product code or existing files were modified; the new audit note is the only workspace change.
