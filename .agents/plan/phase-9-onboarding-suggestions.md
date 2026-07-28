# Phase 9 — AI-visibility setup wizard + suggestion queue (HIGH PRIORITY)

Gap source: ZeroRank flow comparison, 28 Jul. Exit gate at bottom.

## Build
1. **Guided setup wizard** on /p/$projectId/visibility when no primary brand or no
   prompt set exists: stepper (1 set primary brand+domain → 2 add competitors →
   3 create prompt set with topics/prompts (offer starter templates + free-text)
   → 4 review estimated call cost against cap → 5 run now or keep weekly).
   Reuse existing server functions/repos (brand resolution merge, prompt tracking
   CRUD, run guard). Follow /DESIGN.md global --app-* tokens, both themes.
2. **Suggestion queue**: add `suggested` + `rejected` states to tracked prompts
   (schema change — journal tail is 0043 D1 / 0020 pg; take 0044/0021, both
   dialects one commit). Suggestion sources: (a) GSC queries via existing
   search-console services — question/comparison-shaped queries the project
   ranks for; (b) topic-gap heuristics from existing topics. Approve/reject UI +
   MCP actions (extend manage_ai_prompt_tracking with suggest/approve/reject).
   Approved → active in the set; rejected never resurfaces. No paid provider
   calls for suggestions themselves.

## Audit first
Read: src/client/features/ai-visibility/*, brand-resolution service, prompt
tracking service/repo, search-console services, phase-0/1 build reports.

## Do not touch
Answer viewer / brand drill-down / single-prompt run (Phase 10 agent owns).

## Exit gate
- [ ] Fresh project reaches a completed first-run config entirely through the wizard
- [ ] GSC-sourced suggestions appear with approve/reject; decisions persist
- [ ] Both dialects migrations in one commit; ci:check green; full suite green
- [ ] Build report at .agents/plan/audits/phase-9-build-report.md
