# AI Visibility — phased build plan

Eight flows that add ZeroRank-class AI visibility tracking to OpenSEO.

## How to use these

Each `phase-N-*.md` is a self-contained brief. Open one Conductor workspace per
phase and paste the brief as the opening prompt, or point the agent at the file.

**Flows run strictly one at a time.** A flow is not done when the code works —
it is done when its gate passes. Do not open phase N+1 until phase N is signed
off.

## The gate, every flow

1. **Audit** — read the existing code in scope before writing any. Every brief
   names specific files. This step is not optional; the plan itself was rewritten
   once an audit found `shareOfVoice.ts` and `citedSources.ts` already existed.
2. **Design** — schema and interface decisions recorded, dual-dialect resolved on
   paper first.
3. **Build** — implement to the design, tests alongside.
4. **Review** — adversarial pass: correctness, dual-dialect safety, cost exposure,
   error isolation.
5. **Test & verify** — full suite green *plus* live verification against the
   running instance. Something observable must be shown to work.
6. **Gate** — explicit go/no-go against the exit criteria in the brief.

## Order and dependencies

```
0 → 1 → 2 → 3 → 4 → 5 → 6        7 is independent
```

Phase 0 blocks everything. Phase 3 precedes 4 and 5 so sentiment and citation
rollups attach to resolved entities. Phase 6 depends on 5.

## Standing constraints

- Schema changes must work on **both** SQLite/D1 and Postgres. Generate both
  migrations in the same commit, every time.
- Follow the repo convention: TanStack server function → service → repository.
- `pnpm run ci:check` must pass before any gate.
- Ship each phase's data as MCP tools **in the same PR**. Agent access is
  OpenSEO's actual advantage here; deferring it guarantees it never happens.
