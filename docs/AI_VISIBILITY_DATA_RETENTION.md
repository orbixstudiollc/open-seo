# AI visibility data retention

AI visibility keeps terminal run detail for **400 days**, measured from the
run's `completed_at` value. Terminal means `completed`, `partial`, or `failed`.
Pending and running rows are never eligible for age-based pruning.

Deleting an eligible `ai_runs` row cascades to its `ai_answers`,
`ai_brand_mentions`, and `ai_citations`. Pruning is intentionally bounded to 90
runs per repository call so it stays below D1's parameter limit and avoids a
large blocking delete. A maintenance caller should use
`aiVisibilityRetentionCutoff()` and repeat `pruneTerminalRunsBefore()` until it
returns zero.

Prompt sets, enabled-model rows, topics, prompts, tags, tag assignments, brands,
and aliases are not age-pruned. They remain available for auditability until
their project is deleted; project deletion cascades through all AI visibility
data.

R2 caching is separate from retention. Brand Lookup cache entries live for 24
hours and Prompt Explorer response entries for seven days. A stored answer is
the canonical response observed by a run, records its cache key and upstream
fetch time when available, and remains governed by the 400-day database policy
even after its R2 object expires.
