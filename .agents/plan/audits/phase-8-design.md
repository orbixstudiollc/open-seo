# Phase 8 — Global design audit

Date: 2026-07-28

## Decision

Retheme daisyUI first, then replace or override only the pieces whose stock
shape conflicts with `DESIGN.md`.

The existing application already uses a small set of repeated daisyUI and
Tailwind idioms. Keeping those component classes gives the whole app one theme
source instead of introducing a parallel component library. Targeted changes
are still required for page canvases, shadows, display typography, menus,
modals, tabs, focus treatment, and non-action uses of the primary color.

CursorGothic is not bundled or loaded. The app uses the licensed-font fallback
stack:

```css
system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif
```

Code surfaces keep the existing monospace stack.

## Surface inventory

The inventory covered `src/client/**` and `src/routes/**`.

Approximate class-token counts before migration:

| Surface      | Uses |
| ------------ | ---: |
| `.btn*`      |  181 |
| `.tab*`      |   85 |
| `.table*`    |   74 |
| `.input*`    |   60 |
| `.badge*`    |   58 |
| `.card*`     |   44 |
| `.loading*`  |   36 |
| `.card-body` |   31 |
| `.menu*`     |   30 |
| `.select*`   |   29 |
| `.alert*`    |   28 |
| `.dropdown*` |   16 |
| `.tooltip*`  |   13 |
| `.toggle*`   |   10 |
| `.modal*`    |    7 |

There are also 51 explicit `shadow*` utilities. Most are on cards, menus,
tooltips, modal panels, and selected segmented controls. These conflict with
the hairline-only depth rule.

The shared shell is `AuthenticatedAppLayout` + `Sidebar`. It currently places
the route outlet on `base-100` and the sidebar on `base-200`. Route roots are a
mix of inherited backgrounds and explicit `base-100` backgrounds. The global
canvas therefore needs a shell change in addition to theme variables:
`base-200` is the page canvas and `base-100` is the raised card surface.

Major-route ownership and entry points:

| Acceptance route | Entry surface                                            |
| ---------------- | -------------------------------------------------------- |
| Dashboard        | `features/dashboard/DashboardPage`                       |
| Keyword Research | `features/keywords/page/KeywordResearchPage`             |
| Domain Overview  | `features/domain/DomainOverviewPage`                     |
| Backlinks        | `features/backlinks/BacklinksPage`                       |
| Brand Lookup     | `features/ai-search/BrandLookupPage`                     |
| Prompt Explorer  | `features/ai-search/PromptExplorerPage`                  |
| GSC Insights     | `features/search-performance/SearchPerformancePage`      |
| Rank Tracking    | project `rank-tracking` route + feature children         |
| Saved Keywords   | project `saved` route + `features/saved-keywords/**`     |
| Site Audit       | project `audit` route + `features/audit/**`              |
| Settings         | app settings + `features/projects/ProjectSettings`       |
| AI & MCP         | app `ai` route + `features/ai-mcp/**`                    |
| Chat             | `features/sam/**`, `components/chat/**`, onboarding chat |

Auth, onboarding, billing, projects, help/support, global errors, modals,
dropdowns, and table primitives are also in scope because the user ruling is
app-global.

## Global token set

The single source of truth lives on `:root` and
`html[data-theme="openseo-dark"]` as `--app-*` variables.

| Global token            | Light                 | Dark                  | daisyUI mapping         |
| ----------------------- | --------------------- | --------------------- | ----------------------- |
| `--app-canvas`          | warm cream            | warm near-black       | `base-200`              |
| `--app-canvas-soft`     | soft cream            | lifted dark pane      | contextual wells        |
| `--app-surface`         | white                 | lifted dark card      | `base-100`              |
| `--app-ink`             | warm near-black       | warm off-white        | `base-content`, neutral |
| `--app-body`            | warm gray             | warm light gray       | body copy               |
| `--app-muted`           | accessible muted text | accessible muted text | low-emphasis copy       |
| `--app-hairline`        | warm gray hairline    | dark warm hairline    | `base-300`              |
| `--app-hairline-strong` | strong warm outline   | strong warm outline   | controls/focus offset   |
| `--app-primary`         | Cursor Orange         | Cursor Orange         | `primary` only          |
| `--app-primary-active`  | darker orange         | darker orange         | active CTA              |
| `--app-positive`        | semantic green        | semantic light green  | `success`               |
| `--app-negative`        | semantic rose         | semantic coral        | `error`                 |

`--visibility-*` remains temporarily as aliases to `--app-*` so Phase 6 and
Phase 7 pages can land unchanged. Existing AI Visibility consumers are changed
to `--app-*` in the final rename sweep; there is no second scoped value block.

Where the literal reference palette misses 4.5:1 for normal text, the rendered
text token is darkened rather than lowering opacity. Cursor Orange remains the
CTA fill, but its content uses dark ink because white on `#f54e00` is only
3.52:1. This preserves the branded action surface while meeting WCAG AA.

## daisyUI → design-language mapping

| Existing surface                            | Global treatment                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `.btn-primary`                              | orange CTA, dark accessible label, 8px radius, 40px default height, no shadow                  |
| default/outline buttons                     | white/dark surface, ink, strong hairline, 8px radius                                           |
| `.btn-ghost`                                | transparent ink action; neutral hover                                                          |
| `.card`, feature panels                     | card surface, 1px hairline, 12px radius, no shadow                                             |
| `.input`, `.select`, `.textarea`, `.toggle` | card surface, 8px radius, strong hairline, 44px default field height                           |
| focusable controls and links                | 2px visible focus ring with 2px offset on both themes                                          |
| `.tabs-border`                              | ink active rule; active tabs do not spend the orange CTA accent                                |
| `.badge`                                    | neutral warm pill; semantic variants use semantic tokens; primary badges become neutral labels |
| `.alert-*`                                  | semantic border + soft semantic background; no timeline colors                                 |
| `.table`                                    | transparent table on card/canvas, hairline row dividers, soft header well                      |
| `.dropdown-content`, `.menu` popovers       | card surface, strong hairline, 12px radius, no shadow                                          |
| `.modal-box` and custom modal cards         | card surface, hairline, 12px radius, no shadow                                                 |
| tooltip/chart tooltip                       | card surface, strong hairline, no shadow                                                       |
| skeleton/loading                            | muted warm neutrals                                                                            |
| code/pre                                    | monospace on card or soft-canvas well                                                          |
| sidebar/navigation                          | canvas background; neutral active state and ink marker                                         |

## Targeted replacements

- Route outlets and standalone route roots move from `base-100` to the cream
  `base-200` canvas.
- Explicit `shadow*` classes are removed. Overlay separation comes from a
  stronger border and backdrop, not panel elevation.
- Display/page headings move to weight 400 and negative letter spacing. Small
  component titles may remain 600.
- `rounded-2xl`/oversized stock cards are normalized to the 12px card radius
  where they are actual cards.
- Primary orange badges, active-tab rules, decorative icons, chart strokes,
  progress bars, and “selected” labels move to ink or semantic colors. Orange
  remains on primary CTA buttons and focus indication.
- Timeline pastel colors are not introduced outside AI agent timelines.
- The remaining `dark:` status class is replaced with the semantic negative
  token. No OS-keyed status color is permitted.

## Accessibility and verification

- Normal text targets at least 4.5:1 on both canvas and card surfaces.
- Focus is checked on buttons, links, inputs, selects, textareas, tabs, menu
  items, and custom clickable controls.
- Primary CTA foreground/background contrast is checked separately because the
  DESIGN.md white-on-orange pairing does not pass AA at the app button size.
- Every acceptance route is checked at desktop and mobile widths in explicit
  `openseo` and `openseo-dark` themes.
- Visual checks include clipping/overflow, table behavior, menus/modals where
  reachable, and browser console errors.
