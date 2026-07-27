# Cross-cutting tracks

These run alongside the phases. None is a phase of its own; each is work that
belongs inside other phases' PRs.

## MCP tool exposure — every phase

Ship each phase's data as MCP tools **in the same PR that builds it**.

This is OpenSEO's actual advantage over hosted competitors: an agent can drive
it. ZeroRank has no equivalent. Deferring MCP exposure to a final "integration
phase" guarantees it never happens — and without it, the whole build is just a
worse version of a product you could have subscribed to.

## Agent skills — phases 2, 5, 6

New skills for visibility review and citation gap analysis, alongside the
existing SEO skills in `.claude/skills/`.

## Platform breadth — opportunistic

`LlmPlatform` in `src/server/lib/dataforseo/shared.ts` is currently:

```ts
export type LlmPlatform = "chat_gpt" | "google";
```

Two platforms. The incumbent tracks six. Expansion is gated on **DataForSEO
coverage, not your code** — so treat it as a config change to make whenever
upstream adds a platform, not a scheduled piece of work.

Note the cost implication: every added platform multiplies run volume. Adding
four platforms quadruples spend at the same cadence. See Phase 1.

## Cost telemetry — from Phase 1 onward

Per-run spend must be visible from the very first scheduled run. Retrofitting
cost tracking after a surprise invoice is the standard way this goes wrong.
