# Phase 8 — Global design system application

**Effort:** 2–3 weeks. **Depends on:** nothing (parallel-safe with 4/5/6/7 given the
file-ownership rules below). **User ruling 28 Jul:** DESIGN.md applies to the
WHOLE app, not just the AI-visibility surfaces.

## Why this exists

The new AI-visibility pages ship in the Cursor-derived design language
(`/DESIGN.md`); the rest of the app is stock daisyUI. The user has ruled the
design language is global. This phase migrates every existing surface.

## 1. Audit first

- Read `/DESIGN.md` in full — tokens, type scale, spacing rhythm, card
  treatment, single-accent discipline. CursorGothic is NOT licensed: keep the
  system-ui fallback stack everywhere.
- Read `src/client/styles/app.css` — the `.ai-visibility-page` scoped token
  block and both theme variants (`html[data-theme="openseo-dark"]`) are the
  reference implementation, including the semantic
  `--visibility-positive/negative` status tokens.
- Map the daisyUI usage surface: themes in app.css, component classes (btn,
  card, tab, alert, table…) across `src/client/` and `src/routes/`. Catalogue
  before changing.

## 2. Design

- Promote the scoped `--visibility-*` tokens to app-global tokens (rename to
  `--app-*` or similar) defined once at `:root`/theme level; keep both light and
  dark values. The ai-visibility pages then consume the global tokens — one
  source of truth, no scoped duplicate left behind.
- Decide the daisyUI strategy explicitly: retheme daisyUI variables to the
  DESIGN.md palette (cheaper, keeps component classes) vs. replacing components
  (expensive). Recommended: retheme first, replace only where daisyUI's shape
  fights the design (shadows, radii, uppercase labels).
- Document the mapping in the design note.

## 3. Build — file ownership (phases run in parallel)

- YOURS: `src/client/styles/**`, existing routes/components under
  `src/client/features/*` EXCEPT `ai-visibility/` and `brand-resolution/`
  (already on the design language — only swap their scoped tokens to the global
  ones), shared layout/navigation shells.
- NOT YOURS: anything Phase 4 (sentiment) or Phase 5 (citations) is building —
  do not create or edit files under `ai-visibility` services/repos, citation
  pages, or scoring code. No schema changes at all in this phase.

## 4. Review

- Both themes on every reworked page: the dark variant must be designed, not
  inverted. Accent discipline: Cursor Orange for primary actions only.
- No `dark:` OS-keyed Tailwind variants for status colors — use the semantic
  tokens (this exact bug was found and fixed in review once already; commit
  94ca7c9 is the precedent).
- Accessibility: focus states visible on the new hairline-heavy surfaces;
  contrast ≥ WCAG AA on cream and dark canvases.

## 5. Test & verify

- Visual verification in the browser of every major route at desktop + mobile
  width, both themes: Dashboard, Keyword Research, Domain Overview, Backlinks,
  Brand Lookup, Prompt Explorer, GSC Insights, Rank Tracking, Saved Keywords,
  Site Audit, Settings, AI & MCP, chat surfaces.
- `ci:check` green; no test may be deleted to pass.

## 6. Exit gate

- [ ] One global token set; `.ai-visibility-page` scoped block removed
- [ ] Every listed route renders in the design language, both themes
- [ ] No OS-keyed `dark:` status colors anywhere
- [ ] `ci:check` green + build report at
      `.agents/plan/audits/phase-8-build-report.md`
