# Phase 4 — Sentiment & rank-when-mentioned

**Effort:** 1–2 weeks. **Depends on:** Phase 3 gate passed. **Cheap win, outsized payoff.**

## Why this exists

This pair produced the sharpest finding in the ZeroRank audit: Orbix ranks
**#2.8 on average — the best of any brand tracked — while appearing in only 3% of
answers.** That reframes the problem from "our positioning is weak" to "we are
absent, and well-regarded when present." Without these two fields you can measure
presence but not quality of presence.

## 1. Audit first

- Re-read `src/server/lib/chatProvider.ts`. The custom-provider path
  **deliberately drops OpenRouter's usage accounting**, so scoring calls made
  through a custom provider have no cost telemetry. Give scoring its own cost
  path rather than assuming the provider reports it.
- Check how mentions are stored from Phase 0 — position extraction needs the raw
  answer text, not just the mention.

## 2. Build

- Sentiment scoring per mention, computed at ingest.
- Ordinal position of each brand within each answer.

Run both through the existing provider abstraction — no new dependency, and it
works against whatever provider is configured.

## 3. Review

Sentiment is a **model judgement, not a measurement**. Check that:

- It degrades safely — null, never a wrong number — when scoring fails.
- A provider outage does not block ingest of the run itself.
- The UI presents it as an estimate, not a metric.

## 4. Test

- Golden-set tests with hand-labelled mentions: clearly positive, clearly
  negative, genuinely neutral.
- Position extraction tested against real multi-brand answers from the stored
  corpus (listicle and table-formatted answers both).

## 5. Exit gate

- [ ] Every stored mention carries sentiment and position
- [ ] The leaderboard sorts by either
- [ ] Scoring failure never blocks a run
- [ ] Scoring cost is tracked
- [ ] `ci:check` green
