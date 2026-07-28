# Phase 10 — answer explorer audit

Produced 28 Jul 2026 before Phase 10 implementation.

## Existing storage and read boundaries

- `ai_answers.response_text` is the canonical stored answer body. It is copied
  from Prompt Explorer's ordered text extraction and must be rendered as text,
  never parsed as HTML.
- `ai_brand_mentions` stores one resolved answer/brand observation with the
  first body-text occurrence offsets, mention count, deterministic position,
  and nullable scored sentiment. Citation-only brand names do not create
  mention rows.
- `ai_citations` is normalized by answer and URL. Answer detail can load
  citations separately without multiplying answer or mention observations.
- Visibility analytics already limits calculations to terminal runs and
  terminal answers, uses successful answers for visibility and leaderboard
  metrics, applies half-open `[start, end)` windows, and keeps unavailable
  ratios/averages null.

## Single-prompt admission decision

Use the existing `ai_runs` row and `beginAiTrackedRun` admission path with an
optional tracked-prompt selector.

The run schema already records `prompts_total`, `answers_expected`, the atomic
reservation, cost, and completion totals for any prompt subset. A one-prompt
run therefore needs no new run kind or schema column. Admission must:

1. Load the active runnable prompt set and enabled models.
2. Select exactly one non-archived prompt that belongs to that set.
3. Create the normal pending run, retaining the one-active-run-per-set guard.
4. Reserve `1 × enabled models` through
   `reserveProjectAnswerCalls`, the same conditional update used by full and
   scheduled runs.
5. Launch the same Workflow with the selected prompt snapshot.

The Workflow already creates stable answer IDs from
`(run ID, tracked prompt ID, model)`, persists placeholders before provider
work, and claims each pending tuple before spend. A replay that encounters a
running tuple fails it closed instead of issuing another paid call. Passing a
one-prompt snapshot through this path preserves those guarantees unchanged.

The user-facing and MCP inputs should carry both prompt-set and prompt IDs.
The guard, not the caller, verifies their relationship. Cap refusal should
return the existing requested/reserved/cap values; paid-plan and billing errors
should retain their explicit error messages.

## Brand detail conventions

Brand detail should use the same terminal run/answer observations and window
rules as the overview:

- Mention trend counts successful answers and stored mention volume per day.
- Sentiment history averages only scored sentiment observations.
- Average position averages only stored positions.
- Top answers are successful answers that mention the selected brand.
- Citation overlap counts distinct brand-mentioned answers containing each
  citation domain. Its percentage denominator is the number of successful
  answers mentioning the brand; it is null when that denominator is absent.

Missing sentiment, position, citation overlap, or successful-answer coverage
must remain null rather than becoming a numeric zero.

## UI and route surface

The visibility route can become a small nested layout with overview, answers,
and brand-detail children. This stays outside Phase 9's wizard and suggestion
queue. New UI must use global `--app-*` tokens so light and dark themes share
the established treatment.

The answer body should be split into ordinary text and non-overlapping mention
spans in React. No `dangerouslySetInnerHTML` or Markdown renderer is
appropriate for the stored answer reader.

The shared Phase 8 primary-button rule currently lets the hover rule override
disabled styling. Scope hover/active colors to enabled buttons and give
disabled primary buttons reduced opacity with a non-interactive cursor.

## Migration journals

The inspected tails are D1 `0043` and Postgres `0020`; Phase 9 owns
`0044/0021`. Phase 10's selected design needs no schema migration. If a later
review introduces schema work, it must take the next free pair and be
renumbered on merge as needed.
