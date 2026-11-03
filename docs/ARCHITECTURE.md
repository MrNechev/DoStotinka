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
| `users` | Login, base currency, time zone, week start, theme, number locale, demo flag. |
| `sessions` | Opaque session tokens. Only the SHA-256 of a token is stored. Sliding expiry. |
| `accounts` | Name, type, currency, `initial_balance` (minor units), colour, icon, flags. The current balance is `initial_balance + sum(records.amount)`. |
| `categories` | Two-level tree (`parent_id`). `kind` is `expense` or `income`. `system_key` links rows to the default template (e.g. `food.groceries`). Subcategories usually inherit the parent colour (`color = null`). |
| `records` | One row per account movement. `amount` is **signed** (negative = money out) in the account currency. A transfer is two rows sharing `transfer_group_id`, each pointing at the other account via `counterpart_account_id`. |
| `labels`, `record_labels` | Free tags for records. |
| `planned_payments` | Recurrence rule (`frequency`, `interval`, `start_date`, `end_date`) plus `next_due_date` – the next unpaid occurrence. Paying creates a record linked via `planned_payment_id` and advances `next_due_date`; skipping only advances it. |
| `budgets` | Limit per week/month/year for a set of categories (parents include their subcategories) and accounts (empty = all). |
| `exchange_rates` | Per user: value of 1 unit of a currency in the user's base currency, with its source (`ecb`, `manual`, `fixed`, `default`). |
| `reference_rates` | Global cache of the ECB daily rates (units per EUR). |

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
- The API only accepts JSON bodies, which together with SameSite cookies prevents CSRF.

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
