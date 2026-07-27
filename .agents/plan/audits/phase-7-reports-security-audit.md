# Phase 7 — report sharing security audit findings (workspace: auckland)

Produced 27 Jul 2026 by Codex via Conductor. Audit only; no product code was modified. This findings note is the only workspace change.

---

## Bottom line

There is no Phase 7 report/share route, share-link table, or report token implementation in this checkout.

Under `AUTH_MODE=local_noauth`, every normal app data request that needs an identity is treated as the same fixed user, `local-admin` / `admin@localhost`, in organization `delegated-local-admin`. A logged-out visitor is therefore not anonymous: the server promotes that visitor to the installation's admin context without inspecting a cookie, bearer token, or request header.

The existing project boundary still works: a supplied `projectId` must identify an active project in `delegated-local-admin`, and a project from another organization is rejected. That boundary does **not** make a URL project-private in `local_noauth`. Any visitor who can reach the app can list every project in the local-admin organization, obtain their IDs, read their data, mutate them, and invoke paid work. The self-hosted MCP route is exposed on the same basis and does not use OAuth in this mode.

Consequently, an unauthenticated share URL cannot be a meaningful security boundary when the whole `local_noauth` origin is publicly reachable. It can restrict the fields returned by the `/share/...` handler, but it cannot stop its holder from opening the rest of the app or calling `/mcp`. Phase 7 should default public sharing off in `local_noauth`, unless the operator explicitly configures a share-only public origin or a reverse-proxy carve-out while keeping every normal app and MCP path protected.

## How application project scoping works

The project ID in the browser route is routing state, not authorization:

1. Project pages live under `/p/$projectId`. The project layout disables SSR and runs `getProjectAccess` as a client-side redirect check. Its own comment correctly says this is only a navigation guard; real authorization happens on each data call ([project route](src/routes/_project/p/$projectId/route.tsx:19)).
2. Every TanStack server function runs the global `ensureUserMiddleware` ([start.ts](src/start.ts:8)).
3. The middleware reads `projectId` from the server-function input. When present, it queries for an active project with both `projects.id = projectId` and `projects.organization_id = context.organizationId`. A missing, archived, or foreign project becomes `NOT_FOUND` before the handler runs ([ensureUser.ts](src/middleware/ensureUser.ts:19), [ProjectRepository.ts](src/server/features/projects/repositories/ProjectRepository.ts:28)).
4. `requireProjectContext` then narrows the already-authorized project and exposes `context.projectId`. Project-scoped handlers normally use that value instead of trusting a second source of project scope ([server-function middleware](src/serverFunctions/middleware.ts:42)).
5. Child resources are scoped again where necessary. Rank-tracking reads validate `configId` against `projectId`; Site Audit reads combine `auditId` and `projectId`; keyword/tag repositories include `projectId` in their mutations and lookups. This prevents a valid project request from substituting a child ID belonging to another project.

The accepted ADR states the intended invariant clearly: the route cannot supply server-function scope implicitly; every project-scoped call must carry `projectId`, global middleware authorizes it, and handlers use the verified context ([ADR 0001](specs/0001-project-scoping-for-server-functions.md)).

Important exceptions for Phase 7:

- Raw API routes cannot rely on server-function middleware. The GSC callback and MCP transport resolve identity themselves. A public report endpoint will also need an explicit, purpose-built authorization path.
- `ProjectRepository.getProjectById` deliberately has no organization predicate and is reserved for trusted server contexts. A share handler must not use it as its authorization check.
- `restoreProject` deliberately calls its identifier `archivedProjectId`, bypassing active-project middleware, but the write still includes the authenticated organization in its repository predicate.
- The project layout's client redirect and the UUID-like project ID are not security controls.

## `local_noauth` identity and deployment behavior

[`resolveUserContextFromHeaders`](src/middleware/ensure-user/resolve.ts:10) ignores request headers in `local_noauth` and calls `resolveLocalNoAuthContext`. That resolver creates or updates:

- user ID `local-admin`
- email `admin@localhost`
- organization ID `delegated-local-admin`

There is no Better Auth session in this flow. The client route guard also renders authenticated content unconditionally whenever the build is not in hosted mode ([useHostedAuthRouteGuard.ts](src/client/features/auth/useHostedAuthRouteGuard.ts:14)).

The default Docker Compose mapping binds the app to `127.0.0.1`, so a default installation is not remotely shareable. The Docker guide explicitly warns operators to put any tunnel or reverse proxy behind their own authentication ([compose.yaml](compose.yaml:28), [Docker guide](docs/SELF_HOSTING_DOCKER.md:5)). Once the whole origin is made reachable without such protection, every reachable caller receives the local-admin context.

### Explicit security exposure

| Deployment shape                                                                               | What the share recipient can reach                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default Compose, loopback only                                                                 | The URL works only on the Docker host. Any local caller who can reach it is the local admin. It is not a remote share link.                                                                                                                            |
| Whole `local_noauth` origin exposed by a tunnel, public port, or unauthenticated proxy         | The recipient can access the intended report **and the complete local-admin app/MCP surface**. A report token does not reduce this ambient access.                                                                                                     |
| Whole origin protected by upstream authentication                                              | The recipient must pass that upstream authentication. Once admitted, OpenSEO still treats every recipient as the same local admin.                                                                                                                     |
| Only `/share/*` is public; app server-function paths, `/agents/*`, and `/mcp` remain protected | A dedicated token-checked share route can expose only its report payload. This is the one viable `local_noauth` deployment shape for external anonymous sharing on the same installation. A separate share origin is safer and easier to reason about. |

If the normal project dashboard were treated as a report URL, its direct server responses currently expose:

- Project ID, name, domain, market, and creation time from `getProjectAccess`.
- Project domain and GSC connection status/site URL.
- Organization-level MCP authorization and first-tool-call timestamps.
- Project activation timestamps.
- Rank totals: tracked keyword/device observations, improved, declined, top-10, and last-check time.
- Latest audit status, pages crawled, start time, top issue types/severity/counts, and total issue types.
- Backlink domain, rank, backlink/referring-domain/new/lost totals, capture time, and staleness.

The dashboard is not safe to reuse as the public report component. Its activation response mixes project and organization metadata, and mounting it may call `refreshDashboardBacklinkSnapshot`, which performs a paid DataForSEO request when the stored snapshot is missing or stale ([DashboardPage.tsx](src/client/features/dashboard/DashboardPage.tsx:233), [DashboardService.ts](src/server/features/dashboard/services/DashboardService.ts:209)). A public report view must never spend credits, start jobs, refresh data, or mutate “last viewed”/activation state.

More broadly, a caller with ambient `local_noauth` access can:

- Enumerate every local-admin project and read project names, domains, and markets.
- Read saved keywords/tags/metrics, rank-tracking configuration and history, audit pages/issues/Lighthouse results, backlink data, GSC search-performance data, and local-admin SAM sessions/memory exposed by their existing pages and tools.
- Create/update/archive projects, add/remove keywords and tags, change settings or GSC connections, and start rank checks and site audits.
- Invoke DataForSEO-backed app and MCP tools using the operator's API credentials. Self-hosted mode has no hosted credit gate, so the exposure includes upstream spend.

Canonical project scoping prevents those calls from crossing into a different organization present in the same database. It provides no isolation between share recipients or between projects in `delegated-local-admin`, because every visitor has that same organization identity and `list_projects` exposes all of its project IDs.

The future Phase 7 report itself is not defined yet. Given Phases 2–6, it could contain commercially sensitive tracked prompts/topics, visibility history and deltas, competitor and alias decisions, mention sentiment/position, citation URLs and source gaps, Site Audit evidence, and recommendation state. The share contract must enumerate fields explicitly. It must not return raw provider responses, OAuth grants, user/email data, billing/credit data, API configuration, internal activation metadata, suppressed-review data, or unrelated project fields merely because an existing service DTO contains them.

## How MCP authorization differs

Hosted MCP and self-hosted MCP share tool-level project checks, but their caller authorization is materially different.

### Hosted mode

- The Cloudflare Workers OAuth provider wraps `/mcp`, dynamic client registration, authorization, token exchange, discovery, and token storage in `OAUTH_KV`.
- Authorization requires a Better Auth hosted session and explicit consent.
- The grant records `userId`, `organizationId`, client ID, subject, resource audience, and scopes.
- The resource audience is pinned to the installation's exact `/mcp` URL.
- The supported scopes are `mcp` and `offline_access`. `mcp` is one broad read/write scope, not a report-read or project-specific scope.
- Access tokens last 24 hours; refresh tokens last 30 days ([oauth-provider.ts](src/server/mcp/oauth-provider.ts:44)).
- The authenticated MCP transport rejects requests without the `mcp` scope.
- Each project-scoped tool still takes a caller-supplied `projectId` and authorizes it against the token's organization before executing ([project-auth.ts](src/server/mcp/project-auth.ts:13)).

The OAuth grant is therefore organization-wide and action-capable. It is not suitable as a report-share token: it can list projects, write data, run tools, incur spend, and refresh access for 30 days.

### `local_noauth` and Cloudflare Access modes

The OAuth provider is not used. [`src/server.ts`](src/server.ts:160) routes `/mcp` directly to the self-hosted transport:

- `cloudflare_access` verifies the Access JWT before building tool context.
- `local_noauth` accepts every non-OPTIONS request and injects the local-admin context.
- The first-party context has no client ID and an empty scope list. The direct transport intentionally does not require `mcp`, because identity is expected to have been supplied by the deployment boundary.
- Tool-level `projectId` checks still restrict IDs to the injected organization.

Thus, exposing a `local_noauth` origin also exposes MCP without OAuth. An attacker does not need the report token or a bearer token; `list_projects` supplies IDs for subsequent tools, including write-capable and paid tools.

## Existing token and expiry primitives

The codebase already contains the right building blocks and several instructive precedents.

### Better Auth

- Sessions use an opaque, unique token plus a database `expires_at`. The D1 and Postgres schemas have matching representations ([D1 auth schema](src/db/better-auth-schema.ts:28), [Postgres auth schema](src/db/pg/better-auth-schema.ts:28)).
- The `verification` store has `identifier`, `value`, `expires_at`, and an expiry index. Better Auth uses that lifecycle for time-limited verification/reset artifacts.
- Password-reset tokens are configured for one hour and revoke sessions on password reset ([auth.ts](src/lib/auth.ts:70)).
- The five-minute signed session cookie cache explicitly accepts bounded revocation lag; database-backed project authorization still runs separately ([auth-options.ts](src/lib/auth-options.ts:23)).
- OAuth accounts carry access- and refresh-token expiry timestamps. Retrievable OAuth secrets are encrypted at rest from `BETTER_AUTH_SECRET` ([auth-config.ts](src/lib/auth-config.ts:18)).

Reuse the lifecycle pattern, not Better Auth's vendor-owned tables. A report capability is neither a user session nor an identity-verification record. It needs its own normalized table so it can be listed, revoked, audited, cascaded with its project, and migrated in both database dialects.

Also distinguish hashing from encryption: OAuth access tokens must be recovered for outbound calls, so Better Auth encrypts them. A report bearer token never needs to be recovered; store only a SHA-256 digest of it.

### `jose` and Web Crypto

- `jose` is a direct dependency. Cloudflare Access uses `createRemoteJWKSet` plus `jwtVerify` with issuer and audience constraints ([cloudflareAccess.ts](src/middleware/ensure-user/cloudflareAccess.ts:46)).
- GSC uses `decodeJwt` only to parse Google's ID-token subject after the token endpoint exchange. `decodeJwt` does not verify a capability and must not be copied as share-token validation.
- The self-hosted GSC OAuth state is a hand-built HMAC payload with a ten-minute `exp`. It works for that callback but duplicates base64url, signing, parsing, and expiry logic ([selfHostedOAuth.ts](src/server/features/gsc/selfHostedOAuth.ts:23)). A signed report token should use `SignJWT`/`jwtVerify` from `jose` rather than extending this custom format.
- Web Crypto SHA-256 helpers and absolute-expiry comparisons already run in the Worker runtime. R2's “soft TTL” cache pattern is not a security expiry: expired objects may remain stored and the check only occurs in that cache reader.

`BETTER_AUTH_SECRET` is required in hosted mode but optional in default Docker `local_noauth` unless GSC is configured. A share implementation must not silently assume it exists. Either:

1. Prefer a database-backed opaque token, which requires no signing secret and gives immediate revocation; or
2. Require an explicit strong share-token secret and use `jose`, with purpose/issuer/audience/expiry checks and a persisted `jti` if immediate revocation is required.

The first option fits this feature better.

## Recommended share-link contract

Use a dedicated, read-only report capability rather than adapting app auth:

- Create 32 random bytes with Web Crypto, base64url-encode them for the one-time URL, and store only their SHA-256 digest.
- Store a normalized share row containing at least: ID, project ID, organization ID or an equivalent project-owner invariant, report snapshot/config ID, creator, creation time, mandatory expiry, and nullable revocation time. Add unique token-digest and expiry indexes in both dialects.
- Prefer a report snapshot, or persist an immutable field/version allowlist and maximum period. URL controls may narrow a token's period; they must never widen it or switch projects.
- On every request, resolve the token digest, require `revoked_at IS NULL` and `expires_at > now`, then load the same active project bound to that share row. Archiving/deleting a project should make its links unusable.
- If both the URL and share row contain a project/report ID, require equality. Never authorize from the URL's `projectId` alone.
- Return a purpose-built public DTO. Do not construct a normal local-admin/hosted/MCP auth context and do not expose general server functions to the share page.
- Read only persisted data. Do not call providers, refresh caches, start workflows, consume credits, update activation state, or expose report mutations.
- Make revocation immediate. Do not accept the five-minute session-cookie revocation trade-off for bearer report links.
- Send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow, noarchive`. Avoid third-party scripts on the share page and ensure logs/analytics do not capture the raw token.
- Treat the URL as a bearer secret. Consider exchanging it once for a short-lived, HttpOnly, Secure, SameSite cookie and redirecting to a token-free display URL to reduce copying through history, referrers, screenshots, and support logs.

Do not use:

- the project ID as a capability;
- a normal Better Auth session or the Better Auth `verification` table;
- an MCP access/refresh token;
- `decodeJwt` without verification;
- the GSC custom HMAC format;
- R2 cache TTL as security expiry; or
- `crypto.randomUUID()` when a full 256-bit bearer secret is straightforward.

## Required security tests before the Phase 7 gate

- Logged-out share access in hosted mode, and from a separate browser profile.
- `local_noauth` with the default loopback binding, a whole-origin public exposure, and a share-only proxy carve-out; document which configuration is supported.
- Valid token, malformed token, unknown token, expired token, revoked token, and token for an archived/deleted project.
- Valid token plus a substituted project ID, report ID, wider date range, nested audit/config ID, or organization ID.
- Two projects in one organization and two organizations in one database; prove the link reads exactly one report/project.
- Confirm the share page makes no mutation, provider, Workflow, billing, MCP, activation, or background-refresh calls.
- Confirm raw tokens never appear in database rows, analytics events, server error details, referrers, or cacheable responses.
- Confirm report DTO snapshots/allowlists do not acquire newly-added private service fields automatically.
- Confirm revocation is effective on the next request and expiry boundaries use one server-side clock.

The Phase 7 exit gate should not be considered satisfied merely because the share endpoint itself filters by `projectId`. Under `local_noauth`, the deployment boundary must also prevent the recipient from reaching the rest of the local-admin application and MCP surface.
