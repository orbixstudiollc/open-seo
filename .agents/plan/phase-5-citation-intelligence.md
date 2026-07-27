# Phase 5 — Citation source intelligence

**Effort:** 2 weeks. **Depends on:** Phase 3 gate passed (4 may run in parallel).

## Why this exists

Extends per-lookup cited sources into a longitudinal picture, and adds the
analysis that turns measurement into targets: **which domains cite your
competitors but never you.**

The audit found the asymmetry this addresses — `orbix.studio` is the #10 most
cited domain at 19.6%, while the Orbix *brand* appears in 3% of answers. The site
is read and quoted; the brand is not recommended. Only source-level data exposes
that gap.

## 1. Audit first

- `services/citedSources.ts` — the top_pages-versus-mentions split is deliberate:
  page metrics stay authoritative while prompt examples remain sample-based.
  Preserve that distinction.
- `ai-search/safeUrl.ts` — URL and hostname sanitisation with length caps already
  exists. Do not re-derive.
- Establish where domain-type classification would come from **before** assuming
  a source for it.

## 2. Build

- Domain and URL rollups over time.
- Domain-type taxonomy (editorial / corporate / UGC / reference / institutional).
- Citation-density metrics (avg citations per answer, per domain).
- **Competitor-source gap report.**

## 3. Review

Domain-type classification is the weak point. Decide whether it is a maintained
list, a heuristic, or a model call — and be explicit in the UI about which.
Presenting a guess as a fact is the failure mode here.

## 4. Test

- Rollup correctness against a seeded multi-period corpus.
- Gap report asserted to exclude any domain that cites you even once.
- URL sanitisation fuzzed with malformed and over-length inputs.

## 5. Exit gate

- [ ] A ranked list of domains citing tracked competitors with zero citations of
      your brand
- [ ] Domain-type classification method is stated in the UI
- [ ] `ci:check` green

## Reference point

Distribution observed across 2,818 citations in the audited workspace: Editorial
48%, Corporate 28%, UGC 12%, Reference 7%, Other 5%, Institutional 1%. Nearly
half of what models cite is editorial — that shapes what the gap report should
prioritise.
