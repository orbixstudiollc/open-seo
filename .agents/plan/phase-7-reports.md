# Phase 7 — Reports, export & digests

**Effort:** 1–2 weeks. **Depends on:** Phase 2 gate passed. **Independent — promotable.**

## Why this exists

Client-facing packaging. Sequenced last because for an agency running this on its
own domain it is presentation, not capability.

**Promote this phase** if OpenSEO becomes client-delivery infrastructure rather
than an internal tool. That is a business decision, not an engineering one.

## 1. Audit first

- **Check what a share link would expose under `AUTH_MODE=local_noauth`.** The
  Docker self-host runs with app auth disabled and an injected `admin@localhost`
  user. A "shareable" report URL in that mode is a real exposure question, not a
  formality.
- Review how the existing project routes scope data by `projectId`.

## 2. Build

- Report view with period selection.
- PDF / share export.
- Scheduled email digest, reusing the cron from Phase 1.

## 3. Review

**Security review is mandatory for this flow.** Specifically:

- Share token generation and entropy.
- Expiry.
- Exactly what an unauthenticated holder of the link can read.
- Whether a share link leaks across projects or organisations.

## 4. Test

- Export rendered and opened for real, not just generated.
- Share link tested from a logged-out context.
- Digest scheduling verified against the live cron.

## 5. Exit gate

- [ ] A report exports correctly
- [ ] A share link exposes only the intended project, verified logged-out
- [ ] Token expiry works
- [ ] Security review signed off
- [ ] `ci:check` green
