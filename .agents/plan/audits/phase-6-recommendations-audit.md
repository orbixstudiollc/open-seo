# Phase 6 — recommendation pipeline audit findings (workspace: bangui)

Produced 27 Jul 2026 by the parallel audit pass (GPT-5.6 Sol via Conductor). Read-only.

---

Audit complete. Findings are in [phase-6-recommendations-audit.md](.agents/plan/audits/phase-6-recommendations-audit.md).

Key conclusions:

- Technical/on-page recommendations should derive from existing `audit_issues`, using stable cross-audit fingerprints.
- Todo/Done/Declined state belongs in a project-level recommendation queue, not audit-scoped issue rows.
- Off-page recommendations must link directly to future normalized `ai_citations` and resolved competitor brands.
- The proposed schema includes evidence junctions, retained evidence snapshots, and explainable priority factors.
- Phase 0/5 citation persistence is not present yet, and audit schemas are currently omitted from schema-parity coverage.

No implementation or product code was changed; the audit note is the only workspace change.
