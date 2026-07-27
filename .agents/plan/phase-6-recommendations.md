# Phase 6 — Recommendation engine

**Effort:** 2–3 weeks. **Depends on:** Phase 5 gate passed.

## Why this exists

Converts measurement into a work queue. This is where the tool stops describing
the problem and starts assigning tasks.

OpenSEO has a structural advantage here that the incumbent does not: **it already
has a site crawler.** ZeroRank's technical recommendations are inferred; yours
can come from a real audit of the actual site.

## 1. Audit first

- Map the existing **Site Audit** issue model. Technical recommendations should
  extend that pipeline, not create a parallel one.
- Review how ZeroRank frames its own recommendations — Off-Page / On-Page /
  Technical tabs, priority levels, Todo / Done / Decline state. Worth matching as
  a UX reference.

## 2. Build

- Off-page targets derived from Phase 5 gaps, resolved to specific URLs and
  communities.
- On-page and technical recommendations wired into the existing Site Audit.
- Priority scoring.
- Todo / Done / Declined state.

## 3. Review

**Every recommendation must carry its evidence.** An unexplained "post on Reddit"
is noise. "This thread was cited 54 times across tracked answers and names three
competitors" is a task. Review that the priority score is explainable rather than
a black box.

## 4. Test

- Assert each generated recommendation links back to the citations that produced
  it.
- State transitions round-trip.
- Regeneration does not duplicate already-declined items.

## 5. Exit gate

- [ ] A prioritized action list where each item names a concrete destination and
      the evidence that produced it
- [ ] Declined items stay declined across regeneration
- [ ] Technical recommendations come from real Site Audit findings
- [ ] `ci:check` green

## Reference point

The audited workspace resolved off-page targets to named Reddit threads with
citation counts — e.g. one thread cited 54 times — and ranked subreddits by
citation volume. That level of specificity is the bar.
