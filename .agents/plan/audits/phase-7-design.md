# Phase 7 — reports, export, sharing, and digest design

Produced 28 Jul 2026 for `phase-7-reports-share-digests`, before product code
changes.

## Product surface

Add a project-scoped **Reports** page at `/p/$projectId/reports`. The report
offers the existing 7, 30, and 90-day periods and packages two stored-run
surfaces:

- AI visibility: primary-brand visibility, comparison state, answer coverage,
  successful model cohort, and per-platform visibility.
- Citation intelligence: citation density, cited-answer rate, domain and URL
  totals, top cited domains, and top competitor-source gaps.

The page does not duplicate the full analytics workbenches. It is a
client-delivery summary with PDF export, expiring link management, and one
weekly email-digest setting for the signed-in user. It uses the existing
`--visibility-*` tokens, 12px hairline cards, warm canvas, 40px controls, and
responsive single-column layout. Existing pages and Phase 6 recommendations
remain untouched.

## Read model

`ReportService` calls the Phase 2 visibility and Phase 5 citation services with
one `asOf` value and an already-authorized project. Those services read only
persisted runs and observations. The report service constructs and validates a
versioned, purpose-built DTO rather than spreading or serializing an existing
service result.

Version 1 includes project name/domain and the summary fields listed above. It
does not include project or organization IDs, user/email data, raw answer or
provider payloads, exact citation URLs, OAuth/billing/configuration data,
activation state, suppressed review data, or recommendations. Adding a field
to either analytics service cannot add it to a report automatically.

The authenticated page, PDF renderer, anonymous share renderer, and digest
email all consume the same DTO. They do not refresh caches, call providers,
start jobs, spend credits, update activation, or write view analytics.

## Export

An authenticated raw GET route authorizes `projectId` against the caller's
organization, validates the period, builds the stored report, and returns a
real `application/pdf` attachment. PDF generation uses `pdf-lib`, a
Worker-compatible maintained library, with bounded table rows and explicit
pagination. Verification will parse the bytes and render/open the output rather
than checking only that bytes were returned.

## Share capability

Use a dedicated normalized `report_shares` table in SQLite and Postgres:

- opaque row ID;
- project and organization IDs;
- SHA-256 token digest;
- report contract version and fixed window;
- manual/digest purpose and creator;
- creation, mandatory expiry, and nullable revocation timestamps.

Creation uses Web Crypto to generate 32 random bytes and base64url-encode them.
Only the SHA-256 digest is stored. The plaintext token is returned once for the
URL. It is never returned by list operations.

`/share/<token>` and its PDF variant are handled before normal app/OAuth
routing. Each request validates the exact 43-character token shape, hashes it,
and resolves one non-revoked, unexpired share joined to one active project
whose organization equals the share's stored organization. The URL contains no
project, organization, report, or period selector, so a holder cannot
substitute or widen scope.

The anonymous renderer is static HTML with no scripts or third-party resources.
Share responses set `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
`X-Robots-Tag: noindex, nofollow, noarchive`, and a restrictive CSP. Invalid,
unknown, expired, revoked, or archived-project tokens receive the same
not-found response. Revocation is checked in the database on every request.

In `AUTH_MODE=local_noauth`, sharing is disabled by default. It can be enabled
only with `REPORT_PUBLIC_SHARE_MODE=share_only`, which declares that the
operator exposes `/share/*` on a share-only origin or proxy carve-out while
protecting the app, `/mcp`, `/agents/*`, and server-function paths. This flag
does not secure a whole publicly reachable no-auth origin; product copy and
deployment documentation will say so explicitly.

## Digest scheduling

Add a normalized `report_digest_schedules` table with one row per project and
user: recipient email captured from the authenticated context, fixed weekly
cadence, report window, enabled state, next/last send timestamps, and bounded
delivery error metadata.

The existing Phase 1 15-minute `scheduled` handler calls the digest dispatcher
inside the same database scope. A conditional update claims each due row and
advances it by one week before rendering or email delivery, preventing another
cron invocation from sending the same occurrence. The dispatcher generates a
short-lived digest-purpose share, sends the summary through a dedicated Loops
transactional template, records success, and revokes the new share immediately
when delivery fails. Delivery requires `LOOPS_API_KEY`,
`LOOPS_TRANSACTIONAL_REPORT_DIGEST_ID`, and a canonical
`REPORT_PUBLIC_ORIGIN` (falling back to `BETTER_AUTH_URL`).

## Test and security matrix

- Token output is 32 bytes / 256 bits; the database receives only its SHA-256
  digest.
- Valid, malformed, unknown, expired, revoked, and archived-project shares.
- Immediate revocation and one server-side clock at the expiry boundary.
- Two projects in one organization and projects in two organizations; a token
  resolves exactly its joined project and report.
- No project/organization/period selectors are accepted by the public URL.
- Public DTO allowlist and absence of IDs, user/email, raw answers, exact URLs,
  and service-field pass-through.
- Share responses contain no raw token, scripts, analytics, cacheability, or
  referrer leakage and have restrictive headers.
- `local_noauth` sharing defaults off and requires the explicit share-only
  deployment declaration.
- PDF bytes parse and render/open for real.
- Digest due selection, atomic claim/advance, email variables, successful send,
  failed-send revocation, and invocation from the live Phase 1 cron handler.
- Full suite, both schema generators, fresh SQLite migration history,
  disposable Postgres migration history when available, production builds,
  and `pnpm run ci:check`.
