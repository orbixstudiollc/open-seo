# Docker Self-Hosting

Run OpenSEO locally with Docker.

In Docker mode, OpenSEO uses `AUTH_MODE=local_noauth` (no auth checks, local admin user `admin@localhost`). Only expose it behind your own auth-protected reverse proxy, tunnel, or private network.

The default `compose.yaml` uses the published GHCR image:

- `ghcr.io/every-app/open-seo:latest`

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- A DataForSEO API key (see [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md))

## Quickstart

```bash
cp .env.example .env
docker compose up -d
```

Set `DATAFORSEO_API_KEY` in `.env`, then open `http://localhost:<PORT>` (default `3001`).

Docker Compose passes `.env` values into the container, and `compose.yaml` enables `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` so the Cloudflare Vite runtime can read them as Worker bindings during local self-hosting.

Optional env values:

- `PORT` (defaults to `3001`)
- `ALLOWED_HOST` (single reverse-proxy hostname to allow in Vite preview)
- `AUTH_MODE=local_noauth` (already set in compose)
- `OPEN_SEO_IMAGE` (defaults to `ghcr.io/every-app/open-seo:latest`)

If you are putting Docker behind a reverse proxy or a temporary tunnel, remember that Docker self-hosting runs with app auth disabled. Only expose it behind your own auth-protected reverse proxy, tunnel, or private network, and add the public hostname before restarting:

```bash
ALLOWED_HOST=yourdomain.com docker compose up -d
```

You can also persist it in `.env`.

## Public report links

Public report links are disabled by default in Docker's
`AUTH_MODE=local_noauth`. A report token cannot protect an installation when
the same public origin also gives every visitor local-admin access to the app,
`/mcp`, agent routes, and server functions.

To share reports externally, configure a separate public hostname or
reverse-proxy rule that exposes only `/share/*`. Keep every other OpenSEO path
on a private or authentication-protected origin. Then set:

```bash
REPORT_PUBLIC_SHARE_MODE=share_only
REPORT_PUBLIC_ORIGIN=https://reports.example.com
```

`REPORT_PUBLIC_SHARE_MODE=share_only` is an operator declaration, not a network
control. OpenSEO cannot verify the proxy boundary for you. Do not set it when
the complete no-auth origin is publicly reachable.

Weekly report digests additionally require `LOOPS_API_KEY` and
`LOOPS_TRANSACTIONAL_REPORT_DIGEST_ID`. The transactional template receives
the project name/domain, report period, visibility, visibility change, answer
coverage, citations per answer, cited-answer rate, and the seven-day report
URL.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` (or `DO_NOT_TRACK=1`) in `.env`, then run `docker compose up -d --force-recreate open-seo`.

## Pin to a specific image tag

Set `OPEN_SEO_IMAGE` in `.env` and restart:

```bash
OPEN_SEO_IMAGE=ghcr.io/every-app/open-seo:v1.2.3
docker compose up -d
```

## Build your own image locally

If you are testing local code changes, build and run a local tag:

```bash
docker build -f Dockerfile.selfhost -t open-seo:local .
OPEN_SEO_IMAGE=open-seo:local docker compose up -d
```

## Common commands

- Restart service after env changes:

```bash
docker compose up -d open-seo
```

- Pull latest published image and restart:

```bash
docker compose pull && docker compose up -d
```

- Stop:

```bash
docker compose down
```

- Stop and remove volumes:

```bash
docker compose down -v
```

## Troubleshooting environment variables

To confirm Docker Compose is using the expected environment variables:

```bash
docker compose config
```

Check that `AUTH_MODE=local_noauth`, and that `DATAFORSEO_API_KEY` is the base64
encoded value of your DataForSEO email and API password in this format:
`email:password`.

If you changed `.env`, recreate the container so Compose reapplies it:

```bash
docker compose up -d --force-recreate open-seo
```
