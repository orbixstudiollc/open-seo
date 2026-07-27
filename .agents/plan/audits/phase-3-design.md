# Phase 3 brand resolution — design

## Outcome and boundary

Phase 3 turns immutable `ai_brand_mentions` observations into an inspectable
canonical brand view without rewriting the observations. The resolver is
project-scoped. It owns registry reads, resolution decisions, merge/split and
suppression review, clustering suggestions, and resolution-state MCP access. It
does not change scheduling, execution, billing, or analytics-dashboard code.

`raw_name`, `normalized_name`, `mention_count`, and the answer relationship stay
unchanged for the life of a mention. A canonical row is a projection through a
resolution rule, not a destructive update to `ai_brand_mentions.brand_id`.

## Resolution hierarchy

The service applies the audited hierarchy in this order:

1. **Manual decision.** The current manual resolve, suppress, or review rule
   wins. Each decision identifies the actor and reason.
2. **Verified registry.** An exact active canonical name or alias maps to its
   `ai_brands` row. The registry row, alias, and primary domain are evidence.
3. **Generic-term classification.** An exact versioned taxonomy match such as
   `AI`, `SaaS`, `Agency`, or `Product design agency` is suppressed when no
   verified entity matched.
4. **Ambiguous conflict.** Competing entity and generic signals, or generic-like
   candidates such as `Agency A`, become `needs_review`. They remain visible in
   review but stay off the canonical leaderboard.
5. **Clustering suggestion.** Shared verified domains and conservative
   name-family signals may suggest a merge. Suggestions never create or change
   a rule. Token containment or stripping `agency`, `global`, `AI`,
   `community`, or `UI kits` is insufficient for automatic resolution.

This makes the Clay/SaaS boundary explicit: a reviewed `Clay`/`Clay Global`
registry wins; the generic taxonomy suppresses `SaaS` and `AI`; a conflicting
unverified signal is quarantined rather than guessed.

## Persistence and reversibility

Two dialect-parity tables are added:

- `ai_brand_resolution_rules` is an append-only decision ledger. It stores
  project, normalized candidate, state (`resolved`, `suppressed`,
  `needs_review`, or `unresolved`), optional canonical brand, source (`manual`,
  `registry`, `generic`, or `ambiguous`), rule version, confidence, actor,
  reason, timestamps, and optional superseded rule. A partial unique index
  permits one unsuperseded rule per project/candidate.
- `ai_brand_resolution_evidence` stores normalized evidence records related to
  a rule: primary domain, verified alias, generic taxonomy, conflicting signal,
  clustering signal, or manual reason. Evidence is relational rather than an
  opaque JSON payload.

Changing a mapping atomically supersedes its current rule and inserts the next
rule. Merge maps selected candidates to one existing or newly created canonical
brand. Split maps selected candidates to their own existing or newly created
brand. Suppress and restore use the same ledger. Old rules are retained, and no
operation updates or deletes a mention, so merge/split can round-trip with the
same mention IDs, raw strings, and total mention count.

Registry aliases remain deliberate, reviewed evidence. Automatic refresh may
replace only non-manual rules when the rule version changes; it never overrides
an active manual decision.

## Application surfaces

The backend follows server function → `BrandResolutionService` → repository.
The service exposes:

- a bounded project state containing canonical brands, suppressed candidates,
  ambiguous candidates, unresolved candidates, current evidence, history, and
  merge suggestions;
- automatic refresh using the five-tier resolver;
- manual merge, split/restore, suppress, and mark-for-review actions.

The project Brand Resolution page follows `DESIGN.md`: warm flat surfaces,
hairline borders, no decorative shadows, restrained badges, and a compact review
table. Separate tabs show Review, Suppressed, and Resolved. Raw variants,
mention totals, evidence, confidence, and rule version stay visible. Destructive
or ambiguous actions use explicit confirmation copy; split and restore are
available beside resolved/suppressed rows.

MCP gains a read-only resolution-state tool and a project-authorized management
tool for refresh and the same manual actions. Neither calls paid providers.
Outputs are bounded and include raw variants, decision provenance, evidence,
confidence, and rule version.

## Verification

The fixture corpus registers reviewed aliases for Clay, Figma, Lazarev, and
Wavespace; keeps Brix separate; classifies `Agency A/B/C` for review; and
suppresses `SaaS`, `AI`, `Agency`, and `Product design agency`. Tests assert the
hierarchy, suggestion-only behavior, project isolation, MCP authorization,
dual-dialect schema parity, and merge → split mention identity/count
preservation. `detectTarget` additionally requires the existing public-suffix
validator after normalization, with `Lazarev.` and fake-suffix regressions while
all currently valid domain cases remain unchanged.
