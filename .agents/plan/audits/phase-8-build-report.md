# Phase 8 global design build report

Produced 28 Jul 2026 for `phase-8-global-design`.

## Shipped

- One application-wide `--app-*` design token set in
  `src/client/styles/app.css`, with explicit light and dark values for canvas,
  surface, ink, body, muted copy, hairlines, primary action, focus, semantic
  status, radii, typography, and chart treatment.
- Temporary `--visibility-*` compatibility aliases point at the global tokens.
  They contain no independent values or scoped theme block, so Phase 6 and
  Phase 7 can land their existing token references without reintroducing a
  second design source.
- Both daisyUI themes now resolve from the global tokens. Buttons, cards,
  fields, checkboxes, tabs, badges, alerts, tables, dropdowns, modals,
  tooltips, charts, skeletons, toasts, and the shell inherit the same palette,
  radii, typography, and hairline-only depth.
- Existing card, dropdown, tooltip, modal, segmented-control, and mobile-drawer
  shadows were removed. Oversized card radii normalize to 12px and controls use
  8px.
- Page canvases, shared navigation, standalone routes, AI Visibility, Citation
  Intelligence, and Brand Resolution now use the same theme source. The old
  `.ai-visibility-page` token scope is only a page hook; it defines no tokens.
- CursorGothic is not loaded. Display and body type use the documented
  `system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif` fallback, with
  weight-400 page headings and negative display tracking. Code surfaces keep
  the monospace stack.
- Cursor Orange is reserved for primary actions and focus indication. Active
  navigation, tabs, filters, informational badges, chart series, progress,
  selected rows, and chat bubbles use ink, neutral, or semantic colors.
- The remaining OS-keyed `dark:` status color was replaced by the global
  negative token. Status colors now follow the explicit app theme.
- No schema, migration, server contract, provider call, or persisted data model
  changed.

## Visual verification

A seeded local D1 fixture supplied 45 days of AI Visibility data: 984 answers,
1,151 mentions, and 2,680 citations. A Playwright browser pass exercised 16
major surfaces in all four required presentation states:

- desktop 1440×1000, light;
- desktop 1440×1000, dark;
- mobile 390×844, light; and
- mobile 390×844, dark.

The 64 checked route states covered Dashboard, Keyword Research, Domain
Overview, Backlinks, Brand Lookup, Prompt Explorer, GSC Insights, Rank
Tracking, Saved Keywords, Site Audit, global Settings, project Settings, AI &
MCP, chat, AI Visibility, and Brand Resolution.

Results:

- 64/64 routes reached the expected heading or chat surface.
- 64/64 resolved the requested explicit `openseo` or `openseo-dark` theme.
- 0 page errors, navigation timeouts, horizontal page overflows, computed
  shadows, or non-action Cursor Orange surfaces.
- The four URL differences were Site Audit's expected canonical
  `?tab=issues` search parameter.
- The only console message was the existing `local_noauth`
  `/api/auth/get-session` 404, already recorded in `.agents/PAPERCUTS.md`. No
  project server function or route failed.
- Contact sheets and individual screenshots were inspected for every route in
  both themes and widths. Empty, seeded-data, form, table, card, chart, and chat
  states all retained the warm canvas, lifted surfaces, hairlines, readable
  hierarchy, and contained mobile layout.

The Prompt Explorer textarea confirmed the focus contract in the browser:
2px solid outline, 2px offset, `#f54e00` in light and `#ff6b29` in dark. Primary
button foreground/background resolved to warm ink on Cursor Orange in both
themes.

## Contrast

Representative computed token ratios:

| Pair                     | Light   | Dark    |
| ------------------------ | ------- | ------- |
| ink / canvas             | 14.33:1 | 15.61:1 |
| body / canvas            | 6.63:1  | 10.31:1 |
| muted / canvas           | 4.89:1  | 6.31:1  |
| muted / card surface     | 5.25:1  | 5.78:1  |
| primary CTA ink / orange | 5.11:1  | 5.11:1  |
| positive status / canvas | 4.93:1  | 8.57:1  |
| negative status / canvas | 4.70:1  | 6.47:1  |

The literal white-on-orange reference combination was not retained for normal
button text because it is 3.52:1. Warm ink preserves the Orange action surface
and passes WCAG AA.

## Verification

- Static token sweep: `--visibility-*` appears only in the temporary aliases.
- Static theme sweep: no Tailwind `dark:` status utility remains; the only
  `dark:` substring is daisyUI's `prefersdark` configuration.
- Static surface sweep: no source shadow utility or inline chart `boxShadow`
  remains.
- `git diff --check`: green.
- `pnpm build`: green, including client, SSR, and TypeScript.
- `pnpm ci:check`: green, including Prettier, Knip, both TypeScript projects,
  and type-aware Oxlint.

## Exit gate

- [x] One global token set; `.ai-visibility-page` scoped block removed
- [x] Every listed route renders in the design language, both themes
- [x] No OS-keyed `dark:` status colors anywhere
- [x] `ci:check` green and this build report present

## Integration order

Phase 6 and Phase 7 were still based at `b9e110a` during this review stop, so
Phase 8 was not merged. Keep the compatibility aliases through their merges,
then run the final `--visibility-*` → `--app-*` consumer rename across their new
pages immediately before the Phase 8 integration commit. Phase 8 remains the
last merge.
