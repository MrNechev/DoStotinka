# Architecture

This document explains how Slavotax is put together. It is meant for contributors – users only need
the [README](../README.md).

## Overview

```
Browser ──HTTP──► Fastify server (apps/server) ──SQL──► PostgreSQL
   ▲                 │  /api/*      JSON REST API
   │                 └─ /*          static web app (apps/web/dist) with SPA fallback
   └── React SPA (apps/web)
```

The production Docker image contains a single Node.js process that serves both the API and the
compiled web app. A future mobile app talks to the same API using bearer tokens.

## Packages

| Package | Purpose |
| --- | --- |
| `packages/shared` | Pure TypeScript shared by server and web: Zod request schemas, response types, the default category template, currency list, money helpers (minor units, parsing, conversion) and recurrence rules for planned payments. Exported as TypeScript source and bundled by the consumers. |
| `apps/server` | Fastify 5 API. Validation via `fastify-type-provider-zod`, persistence via Drizzle ORM (`postgres` driver). Bundled with esbuild into `dist/`. |
| `apps/web` | React 19 SPA built with Vite. Server state via TanStack Query, routing via React Router, charts via Recharts, primitives from Radix UI, styling with Tailwind CSS 4. |

## Data model

All tables (except the shared `reference_rates` cache) carry a `user_id`; every query filters by it.

| Table | Notes |
| --- | --- |
| `users` | Login, base currency, time zone, week start, theme, number locale, UI language, demo and admin flags, reminder settings. |
| `sessions` | Opaque session tokens. Only the SHA-256 of a token is stored. Browser sessions have a sliding expiry; named rows are personal API tokens with a fixed long expiry. |
| `accounts` | Name, type, currency, `initial_balance` (minor units), colour, icon, flags. The current balance is `initial_balance + sum(records.amount)`. |
| `categories` | Two-level tree (`parent_id`). `kind` is `expense` or `income`. `system_key` links rows to the default template (e.g. `food.groceries`). Subcategories usually inherit the parent colour (`color = null`). |
| `records` | One row per account movement. `amount` is **signed** (negative = money out) in the account currency. A transfer is two rows sharing `transfer_group_id`, each pointing at the other account via `counterpart_account_id`. |
| `labels`, `record_labels` | Free tags for records. |
| `record_templates` | Saved record values (type, accounts, category, optional amount, payee, note, label ids) applied in the record editor. |
| `attachments` | Files of a record (receipts, invoices) stored as `bytea`. No foreign key to `records` because editing a record re-creates its rows with the same ids; files are deleted with their record and orphans are swept periodically. Both sides of a transfer share the files of the outgoing row. |
| `planned_payments` | Recurrence rule (`frequency`, `interval`, `start_date`, `end_date`) plus `next_due_date` – the next unpaid occurrence. Paying creates a record linked via `planned_payment_id` and advances `next_due_date`; skipping only advances it. |
| `budgets` | Limit per week/month/year for a set of categories (parents include their subcategories) and accounts (empty = all). |
| `debts` | Money lent (`lent`) or borrowed (`borrowed`) per person. Money movements are records with `debt_id` (lending/borrowing and repayments); an amount owed from before is `opening_amount`. Statistics, budgets and record summaries ignore records with a `debt_id`. |
| `goals` | Savings goals: target amount/date and either a manually saved amount or a linked account whose balance is the progress. |
| `exchange_rates` | Per user: value of 1 unit of a currency in the user's base currency, with its source (`ecb`, `manual`, `fixed`, `default`). |
| `reference_rates` | Global cache of the ECB daily rates (units per EUR). |
| `app_settings` | Server-wide settings changed by administrators (e.g. whether sign-ups are open). |

Money is always an integer in the minor unit of its currency (`EUR 12.34` → `1234`). Statistics
convert per currency into the base currency using the user's current rates.

## Statistics

`apps/server/src/services/stats.ts` aggregates in SQL, grouped by currency, and converts in
JavaScript. Time buckets use `date_trunc(day|week|month, occurred_at AT TIME ZONE <tz>)` where `tz`
is the browser's IANA time zone, so "a day" always means the user's local day. Missing buckets are
filled in so charts have a continuous x-axis. "All accounts" means all accounts that are not
excluded from statistics; an explicit account selection always includes the chosen accounts.

## Authentication

- `POST /api/auth/login` creates a session and sets the `slavotax_session` cookie (HttpOnly,
  SameSite=Lax, Secure on HTTPS). With `"issueToken": true` the raw token is also returned for API
  clients, which send it as `Authorization: Bearer <token>`.
- Passwords are hashed with Argon2id. Auth endpoints are rate limited.
- The API only accepts JSON bodies (and raw image/PDF bodies for attachments), which need a CORS
  preflight from other origins. Together with SameSite cookies this prevents CSRF.
- Attachments are checked against their file signature on upload and served with `nosniff` and a
  sandboxing CSP for images, so an uploaded file can never run as a page of the app.

## Background jobs

`apps/server/src/jobs.ts` runs inside the server process (no extra service):

| Job | Interval | Purpose |
| --- | --- | --- |
| Exchange rates | 6 h | Download ECB rates and apply them to non-manual user rates. |
| Automatic planned payments | 15 min | Record due occurrences of plans with `auto_confirm`. |
| Reminders | 15 min | Send the daily ntfy/Gotify/Discord/Slack/webhook message once the user's hour has passed. |
| Cleanup | 12 h | Delete expired sessions and files of deleted records. |
| Demo reset | `DEMO_RESET_HOURS` | Regenerate the demo data. |

Confirming or skipping a planned occurrence is a compare-and-set on `next_due_date`, so a double
click and the automatic job can never record the same occurrence twice.

## Administration

The first real user of a server is the administrator (`users.is_admin`). Admin routes live under
`/api/admin` behind the `requireAdmin` hook. `ALLOW_REGISTRATION` is only the default – an
administrator can override it (`app_settings.registrationEnabled`); the very first user can always
register.

## Translations

The web app uses a tiny gettext-style layer (`apps/web/src/i18n`): the English text is the key,
`t('Due in {n} days', { n })` interpolates and `tn()` handles plurals. The language is detected
from the browser (or chosen in Settings) and fixed per page load – switching reloads the page – so
`t()` also works in plain modules. `main.tsx` loads the dictionary of that language (a separate
chunk) before it imports the app, so texts translated at import time are already translated. Dates are formatted with the matching `date-fns` locale via
`lib/date.ts`. Default categories that were never renamed are translated on the client using their
`system_key`. A unit test fails when a UI string has no Bulgarian translation. Server-generated
reminders use the `users.language` column, which the web app keeps in sync.

## Backup & restore

`GET /api/export/backup.json` exports all data of a user; `POST /api/me/restore` replaces the user's
data with such a file, generating new IDs and re-linking all references, so a backup can be restored
into another account or server.

## Demo data

`apps/server/src/demo/generate.ts` creates ~400 days of deterministic but realistic records (salary,
rent, groceries, trips abroad in USD, credit card statements, ATM withdrawals …), planned payments
(including one overdue) and budgets, always ending "today". The data is regenerated on startup and
every `DEMO_RESET_HOURS`.

## Migrations

Drizzle Kit generates SQL migrations into `apps/server/drizzle` from `src/db/schema.ts`
(`pnpm db:generate`). They are applied automatically on startup.

## Testing

- `packages/shared/test` – unit tests (money parsing/formatting, recurrence rules).
- `apps/server/test` – API integration tests using `app.inject` against a real PostgreSQL database
  (`TEST_DATABASE_URL`). The schema is reset once per test run.
- `apps/web/src/**/*.test.ts` – unit tests for CSV parsing/import helpers and translation coverage.
- `tests/e2e` – Playwright end-to-end tests (desktop, mobile, Bulgarian) against a running instance;
  CI runs them against a production build.
