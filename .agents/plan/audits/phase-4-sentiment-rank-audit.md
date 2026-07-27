# Phase 4 — sentiment & rank audit findings (workspace: san-juan)

Produced 27 Jul 2026 by the parallel audit pass (GPT-5.6 Sol via Conductor). Read-only.

---

Audit complete: [Phase 4 sentiment/rank findings](<.agents/plan/audits/phase-4-sentiment-rank-audit.md>).

Key findings:

- Custom providers lose portable actual-USD telemetry; existing code converts missing OpenRouter cost metadata to zero.
- Scoring needs a separate per-answer attempt ledger, with actual/estimated/unknown cost provenance and explicit custom-provider pricing.
- Raw answers must come from the four-model Prompt Explorer path. The two-platform mentions path lacks answer text.
- Position extraction requires the full answer and all resolved mentions together. Mention cardinality and ordinal semantics must be defined before implementation.
- Citation-only matches must not receive sentiment or position.

Only the audit note was added. No code, schema, migrations, or tests were modified; tests were not run.
