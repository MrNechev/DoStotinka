<div align="center">

<img src="apps/web/public/favicon.svg" width="72" height="72" alt="Slavotax logo" />

# Slavotax

**A simple, self-hosted budget & money manager.**

Track your accounts, expenses, income, transfers and scheduled payments – and see at a glance where your money goes.

[![CI](https://github.com/MrNechev/slavotax/actions/workflows/ci.yml/badge.svg)](https://github.com/MrNechev/slavotax/actions/workflows/ci.yml)
[![Docker image](https://github.com/MrNechev/slavotax/actions/workflows/docker.yml/badge.svg)](https://github.com/MrNechev/slavotax/pkgs/container/slavotax)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

<img src="docs/screenshots/dashboard-light.webp" alt="Slavotax dashboard" width="900" />

</div>

---

Slavotax is inspired by the core of mobile budget apps like *Wallet by BudgetBakers* – without the
subscriptions, upsells and features nobody uses. You enter your transactions, Slavotax turns them
into clear, colourful statistics. Everything runs on your own server; your financial data never
leaves it.

> **Status: alpha.** The core features are complete and usable, but expect changes before 1.0.
> Please [report bugs](https://github.com/MrNechev/slavotax/issues) – feedback is very welcome.

## Features

- **Multiple users** – everyone has their own private data. The first user becomes the
  administrator and can add users, reset passwords and close sign-ups from the web UI.
- **Accounts** – cash, bank, savings, credit cards, deposits, investments, loans … each with its own
  balance and currency. Set or adjust balances at any time, archive old accounts, reorder them.
- **Records** – expenses and income with amount, date & time, category, payee, note and labels.
  Amount fields understand simple maths (`12.40+3.10`) and both `,` and `.` as decimal separator.
- **Templates** for records you enter often (“Morning coffee”, “Move to savings”) – one tap fills
  in account, category, amount, payee, note and labels. Frequent combinations are also suggested
  automatically.
- **Receipts & files** – attach photos of receipts or PDF invoices to any record. Photos are
  scaled down in the browser before uploading; files are stored in the database (so they are part
  of the database backup).
- **Transfers** between accounts, including between different currencies.
- **A really detailed category tree** – 30 groups with ~240 subcategories for expenses *and* income
  (salary, freelance, dividends, refunds, benefits, gifts …). Fully customisable: add, rename,
  recolour, change icons, archive or delete.
- **Statistics**
  - spending and income by category as a donut chart with drill-down into subcategories
  - spending over time per day / week / month, stacked by category
  - cash flow (income vs. expenses) and balance trend
  - comparison with the previous period
  - a report table: every category per month (or week) with totals and averages
  - any period: last 7 / 30 days, 12 weeks, 6 months, 12 months, a week, month or year, all time
    or a custom range
  - for all accounts, a single account or any combination of accounts
- **Account details** – the same statistics for every individual account.
- **Planned payments** – rent, taxes, subscriptions, salary … one-time or recurring (daily, weekly,
  monthly, yearly, every N periods). Mark them as paid (creates the record), skip them, or let them be
  recorded automatically on the due date. Overdue payments are highlighted, and a daily reminder can
  be sent to your phone via ntfy, Gotify, Discord, Slack or any webhook.
- **Calendar** – see your spending day by day and what is due next.
- **Budgets** – weekly, monthly or yearly limits for any set of categories and accounts, with
  history.
- **Savings goals** – save towards a target (optionally by a date); progress comes from manual
  contributions or the balance of a linked account, with the monthly amount you need to put aside.
- **Multi-currency** – Euro by default; 55 currencies supported. Exchange rates are updated daily
  from the European Central Bank (or set manually). The fixed BGN/EUR rate is built in.
- **Labels** to tag records across categories (e.g. “Vacation”).
- **Bulk editing** – select many records to recategorise, move, label or delete them at once.
- **Import from CSV** – step-by-step import with column, account and category mapping. Exports of
  *Wallet by BudgetBakers* are recognised automatically (categories are matched, transfers paired),
  bank statements work too. Duplicates are skipped. See
  [Moving from Wallet](docs/MIGRATING_FROM_WALLET.md).
- **Export & restore** – CSV export of records, a full JSON backup and restoring it.
- **Dark mode**, responsive design for phones (installable as a PWA) and a keyboard shortcut
  (<kbd>N</kbd>) for adding records.
- **English and Bulgarian** interface (including the category tree and dates) – more languages are
  easy to add, see [CONTRIBUTING.md](CONTRIBUTING.md#translations).
- **Demo account** with a full year of realistic example data.
- **REST API** with interactive OpenAPI documentation at `/api/docs` and personal API tokens –
  ready for automations and a future mobile app.

## Screenshots

| Statistics | Spending by category |
| --- | --- |
| <img src="docs/screenshots/statistics.webp" alt="Statistics" /> | <img src="docs/screenshots/statistics-categories.webp" alt="Spending by category" /> |
| **Records** | **Adding a record** |
| <img src="docs/screenshots/records.webp" alt="Records" /> | <img src="docs/screenshots/add-record.webp" alt="Add record dialog" /> |
| **Planned payments** | **Budgets** |
| <img src="docs/screenshots/planned.webp" alt="Planned payments" /> | <img src="docs/screenshots/budgets.webp" alt="Budgets" /> |
| **Report** | **Savings goals** |
| <img src="docs/screenshots/report.webp" alt="Monthly report" /> | <img src="docs/screenshots/goals.webp" alt="Savings goals" /> |
| **Calendar** | **Dark mode** |
| <img src="docs/screenshots/calendar.webp" alt="Calendar" /> | <img src="docs/screenshots/dashboard-dark.webp" alt="Dark mode" /> |

<p align="center">
  <img src="docs/screenshots/mobile-dashboard.webp" alt="Mobile dashboard" width="260" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-statistics.webp" alt="Mobile statistics" width="260" />
</p>

## Installation

Slavotax runs as two containers: the app itself and a PostgreSQL database. All you need is
[Docker](https://docs.docker.com/engine/install/) with the Compose plugin.

### Option 1 – Docker Compose with the published image (recommended)

```bash
mkdir slavotax && cd slavotax

# Download the compose file and the example configuration
curl -fsSLO https://raw.githubusercontent.com/MrNechev/slavotax/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/MrNechev/slavotax/main/.env.example -o .env

# Set a strong database password
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 24)/" .env

docker compose up -d
```

Open **http://&lt;your-server&gt;:3000**, create your account – done. Images are published for
`linux/amd64` and `linux/arm64` (e.g. Raspberry Pi 4/5) at `ghcr.io/mrnechev/slavotax`.

> Want to look around first? Click **“Explore the demo account”** on the login page
> (or log in as `demo@slavotax.app` / `demo1234`).

### Option 2 – Build the image yourself with Docker

```bash
git clone https://github.com/MrNechev/slavotax.git
cd slavotax
cp .env.example .env            # then edit DB_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

The multi-stage [`Dockerfile`](Dockerfile) builds the web app and the server and produces a small
Alpine-based image that runs as an unprivileged user.

### Updating

```bash
docker compose pull && docker compose up -d       # option 1
git pull && docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build   # option 2
```

Database migrations run automatically when the container starts.

### After installing

- Create your account – the first account on a server becomes its **administrator**. Under
  *Administration* you can add accounts for your family and switch off public sign-ups (or set
  `ALLOW_REGISTRATION=false` in `.env`).
- Disable the demo account on private servers with `DEMO_ENABLED=false`.
- Put Slavotax behind a reverse proxy with HTTPS if it is reachable from the internet (see below).

## Configuration

All settings are environment variables (set them in `.env` when using Docker Compose).

| Variable | Default | Description |
| --- | --- | --- |
| `SLAVOTAX_PORT` | `3000` | Host port of the web app (Compose only). |
| `SLAVOTAX_VERSION` | `latest` | Image tag to run (Compose only). |
| `DB_PASSWORD` | – | **Required.** PostgreSQL password. |
| `DB_USERNAME` | `slavotax` | PostgreSQL user. |
| `DB_DATABASE_NAME` | `slavotax` | PostgreSQL database. |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | Database host and port (Compose sets the host automatically). |
| `DATABASE_URL` | – | Full connection string; overrides the `DB_*` variables. |
| `DB_DATA_LOCATION` | `./postgres` | Where the database files are stored on the host (Compose only). |
| `ALLOW_REGISTRATION` | `true` | Allow new users to sign up (default; administrators can override it in the UI). The very first user can always register. |
| `DEMO_ENABLED` | `true` | Create the demo account with example data. |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | `demo@slavotax.app` / `demo1234` | Credentials of the demo account. |
| `DEMO_RESET_HOURS` | `24` | Regenerate the demo data every N hours (`0` = only on start). |
| `SESSION_TTL_DAYS` | `30` | How long a login stays valid without activity. |
| `COOKIE_SECURE` | `auto` | `auto` = Secure cookie when the request came over HTTPS; or `true` / `false`. |
| `TRUST_PROXY` | `false` | Set to `true` (or a hop count / IP list) behind a reverse proxy. |
| `EXCHANGE_RATES_AUTO_UPDATE` | `true` | Fetch the daily ECB reference rates. |
| `EXCHANGE_RATES_URL` | ECB daily XML | Alternative source in the same format. |
| `NOTIFICATIONS_ENABLED` | `true` | Allow users to send payment reminders to a URL of their choice (ntfy, Gotify, Discord, Slack, webhook). Disable on servers with untrusted users. |
| `API_DOCS` | `true` | Serve the OpenAPI documentation at `/api/docs`. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `20` | Login / registration attempts per IP and minute. |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `TZ` | `UTC` | Time zone of the container. |

### Reverse proxy

Slavotax is a normal HTTP service on port 3000. Example for **Caddy**:

```caddyfile
money.example.com {
    reverse_proxy localhost:3000
}
```

Example for **Nginx**:

```nginx
server {
    server_name money.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `TRUST_PROXY=true` so that HTTPS and client IPs are detected correctly.

### Backups

Your data lives in PostgreSQL. The compose file contains an optional backup service that writes a
compressed SQL dump every day to `./backups` and keeps the last 14 days (`BACKUP_LOCATION`,
`BACKUP_KEEP_DAYS`):

```bash
docker compose --profile backup up -d
```

Or make a backup by hand:

```bash
docker exec slavotax_postgres pg_dump -U slavotax slavotax | gzip > slavotax-$(date +%F).sql.gz
```

Restore into a fresh installation with
`gunzip -c backup.sql.gz | docker exec -i slavotax_postgres psql -U slavotax slavotax`.
Every user can additionally download their own data (CSV / JSON) in **Settings → Your data** and
restore such a JSON backup there – also on a different Slavotax server. The JSON backup does not
contain attached receipts; the database backup does.

## Development

Requirements: **Node.js 24+**, **pnpm 10** (`corepack enable`) and Docker (for PostgreSQL).

```bash
git clone https://github.com/MrNechev/slavotax.git && cd slavotax
pnpm install

# Start a development database
docker run -d --name slavotax-dev-db -p 54329:5432 \
  -e POSTGRES_USER=slavotax -e POSTGRES_PASSWORD=slavotax -e POSTGRES_DB=slavotax postgres:18-alpine
docker exec slavotax-dev-db createdb -U slavotax slavotax_test   # for the tests

echo "DATABASE_URL=postgres://slavotax:slavotax@localhost:54329/slavotax" > .env
echo "NODE_ENV=development" >> .env

pnpm dev   # API on http://localhost:3000, web app with hot reload on http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the API (auto-restart) and the Vite dev server. |
| `pnpm build` | Production build of the web app and the server. |
| `pnpm test` | Unit tests and API integration tests (needs the test database). |
| `pnpm typecheck` | TypeScript checks for all packages. |
| `pnpm lint` / `pnpm lint:fix` | Linting & formatting with Biome. |
| `pnpm db:generate` | Creates a SQL migration after changing `apps/server/src/db/schema.ts`. |
| `pnpm --filter @slavotax/server demo:reset` | Regenerates the demo data. |

### Tech stack

| Part | Technology |
| --- | --- |
| Web app | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router, Recharts, Radix UI, Lucide icons |
| API server | Node.js 24, Fastify 5, Zod, Drizzle ORM, Argon2id password hashing, OpenAPI |
| Database | PostgreSQL 18 |
| Tooling | pnpm workspaces, Biome, Vitest, esbuild, GitHub Actions, multi-arch Docker images |

### Project structure

```
apps/
  server/        Fastify REST API (routes, services, Drizzle schema & migrations, demo data)
  web/           React single page app
packages/
  shared/        Code shared by both: validation schemas, API types, categories, currencies,
                 money and recurrence helpers
docs/            Screenshots and additional documentation
```

More details for contributors are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### API

The web app talks to a documented JSON API under `/api`. Browse it interactively at
`http://<your-server>:3000/api/docs`. Create a personal API token in **Settings → API tokens** and
send it as `Authorization: Bearer <token>` – handy for scripts and phone automations (e.g. an iOS
Shortcut that logs a cash expense). All amounts are integers in minor units (cents). See
[docs/API.md](docs/API.md) for examples.

## Roadmap

- [x] CSV import (from Wallet and bank statements)
- [x] Translations (Bulgarian first)
- [ ] More languages (contributions welcome)
- [ ] Mobile app that connects to your own server
- [ ] Shared accounts / households
- [x] Attachments (receipts) and record templates
- [x] Notifications for upcoming payments

Ideas and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Slavotax is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
