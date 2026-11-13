<div align="center">

<img src="apps/web/public/favicon.svg" width="72" height="72" alt="DoStotinka logo" />

# DoStotinka

**A simple, self-hosted budget & money manager.**

Track your accounts, expenses, income, transfers and scheduled payments – and see at a glance where your money goes.

[![CI](https://github.com/MrNechev/DoStotinka/actions/workflows/ci.yml/badge.svg)](https://github.com/MrNechev/DoStotinka/actions/workflows/ci.yml)
[![Docker image](https://github.com/MrNechev/DoStotinka/actions/workflows/docker.yml/badge.svg)](https://github.com/MrNechev/DoStotinka/pkgs/container/dostotinka)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

<img src="docs/screenshots/dashboard-light.webp" alt="DoStotinka dashboard" width="900" />

</div>

---

DoStotinka is inspired by the core of mobile budget apps like *Wallet by BudgetBakers* – without the
subscriptions, upsells and features nobody uses. You enter your transactions, DoStotinka turns them
into clear, colourful statistics. Everything runs on your own server; your financial data never
leaves it.

> **Status: alpha.** The core features are complete and usable, but expect changes before 1.0.
> Please [report bugs](https://github.com/MrNechev/DoStotinka/issues) – feedback is very welcome.

## Features

- **Households** – share your money with your partner or family: everybody logs in with their own
  account (own password, two-factor login, language) and works with the same accounts, records and
  budgets. Invite by e-mail; leaving brings back your own data.
- **Multiple users** – everyone has their own private data. The first user becomes the
  administrator and can add users, reset passwords and close sign-ups from the web UI.
- **Two-factor login** with any authenticator app (TOTP) and one-time recovery codes.
- **Accounts** – cash, food vouchers, bank, savings, credit cards, deposits, investments, property,
  loans …
  each with its own balance, currency, colour and icon – including the logos of DSK Bank, UBB,
  Revolut, Pluxee and Edenred. Set or adjust balances at any time, archive old accounts, reorder them.
- **Records** – expenses and income with amount, date & time, category, payee, note and labels.
  Amount fields understand simple maths (`12.40+3.10`) and both `,` and `.` as decimal separator.
  Notes you wrote before are suggested while you type (can be switched off).
- **Templates** for records you enter often (“Lidl”, “Move to savings”) – one tap fills in account,
  category, payee, note and labels; the amount only if you want. Frequent combinations are also
  suggested automatically.
- **Rules** – “payee contains *LIDL* → *Groceries*, payee *Lidl*, label *Food*”: they fill in
  imported transactions, pick the category while you type and can clean up past records. Payees
  can be renamed or merged across all records.
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
- **Monthly review** – what was different from usual, where the money went, the largest and
  unusual payments and how the budgets ended; optionally sent to your phone on the 1st.
- **Net worth & investments** – everything you own and owe in one number with its history.
  Holdings (ETFs, shares, crypto) with prices typed in or updated from Yahoo Finance / CoinGecko;
  property such as a car or flat.
- **Planned payments** – rent, taxes, subscriptions, salary … one-time or recurring (daily, weekly,
  monthly, yearly, every N periods). Mark them as paid (creates the record), skip them, or let them be
  recorded automatically on the due date. Overdue payments are highlighted, and a daily reminder can
  be sent to your phone via ntfy, Gotify, Discord, Slack or any webhook.
- **Calendar** – see your spending day by day and what is due next.
- **Budgets** – weekly, monthly or yearly limits for any set of categories and accounts, with
  history.
- **Debts** – money lent to friends or borrowed from family, with repayments, due dates and what
  is still open. Lending and repaying move money between your accounts but never count as income
  or expenses.
- **Savings goals** – save towards a target (optionally by a date); progress comes from manual
  contributions or the balance of a linked account, with the monthly amount you need to put aside.
- **Multi-currency** – Euro by default; 55 currencies supported. Exchange rates are updated daily
  from the European Central Bank (or set manually). The fixed BGN/EUR rate is built in.
- **Labels** to tag records across categories (e.g. “Vacation”).
- **Bulk editing** – select many records to recategorise, move, label or delete them at once.
- **Automatic import** (optional, off by default) – records arrive on their own, in two ways that
  can be combined:
  - **payment notifications from your phone** – an automation app (MacroDroid, Tasker, iOS
    Shortcuts) forwards the notifications of your banking apps, Google Wallet or bank SMS;
    DoStotinka reads amount, direction and shop (DSK, UBB, Revolut and Google Wallet formats
    included). Instant, no third party.
  - **bank connection (open banking)** – your own free [Enable Banking](https://enablebanking.com)
    application reads booked transactions and balances from DSK, UBB, Revolut and 2,500+ European
    banks (PSD2, read-only, your bank password never touches DoStotinka).

  New transactions wait in an **inbox** with suggested categories; duplicates between sources and
  records you entered by hand are detected, transfers between your accounts are recognised. See
  [Automatic import](docs/USER_GUIDE.md#automatic-import).
- **Import from CSV** – step-by-step import with column, account and category mapping. Exports of
  *Wallet by BudgetBakers* are recognised automatically (categories are matched, transfers paired),
  bank statements work too, and import profiles remember the settings per bank. Duplicates are
  skipped. See
  [Moving from Wallet](docs/MIGRATING_FROM_WALLET.md).
- **Export & restore** – CSV export of records, a full JSON backup and restoring it.
- **Android app** – your own server full-screen, with built-in import of payment notifications
  (no extra automation app needed). See [apps/android](apps/android/README.md).
- **iPhone app** – your own server full-screen, with a Shortcuts action for the Wallet
  “Transaction” automation that sends card payments to the inbox. See [apps/ios](apps/ios/README.md).
- **Offline entry** – add records without a connection to your server (away from home); they are
  sent when it is reachable again. Works in the apps over plain http, too.
- **Dark mode**, responsive design for phones (installable as a PWA) and a keyboard shortcut
  (<kbd>N</kbd>) for adding records.
- **English and Bulgarian** interface (including the category tree and dates) – more languages are
  easy to add, see [CONTRIBUTING.md](CONTRIBUTING.md#translations).
- **Demo account** with a full year of realistic example data.
- **REST API** with interactive OpenAPI documentation at `/api/docs` and personal API tokens –
  ready for automations.

The [user guide](docs/USER_GUIDE.md) explains every feature in detail.

## Screenshots

| Statistics | Spending by category |
| --- | --- |
| <img src="docs/screenshots/statistics.webp" alt="Statistics" /> | <img src="docs/screenshots/statistics-categories.webp" alt="Spending by category" /> |
| **Records** | **Adding a record** |
| <img src="docs/screenshots/records.webp" alt="Records" /> | <img src="docs/screenshots/add-record.webp" alt="Add record dialog" /> |
| **Planned payments** | **Budgets** |
| <img src="docs/screenshots/planned.webp" alt="Planned payments" /> | <img src="docs/screenshots/budgets.webp" alt="Budgets" /> |
| **Savings goals** | **Debts** |
| <img src="docs/screenshots/goals.webp" alt="Savings goals" /> | <img src="docs/screenshots/debts.webp" alt="Debts" /> |
| **Report** | **Calendar** |
| <img src="docs/screenshots/report.webp" alt="Monthly report" /> | <img src="docs/screenshots/calendar.webp" alt="Calendar" /> |
| **Inbox (automatic import)** | **Automatic import settings** |
| <img src="docs/screenshots/inbox.webp" alt="Inbox of imported transactions" /> | <img src="docs/screenshots/automatic-import.webp" alt="Automatic import settings" /> |

<p align="center"><img src="docs/screenshots/dashboard-dark.webp" alt="Dark mode" width="900" /></p>

<p align="center">
  <img src="docs/screenshots/mobile-dashboard.webp" alt="Mobile dashboard" width="260" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-statistics.webp" alt="Mobile statistics" width="260" />
</p>

## Installation

DoStotinka runs as two containers: the app itself and a PostgreSQL database. All you need is
[Docker](https://docs.docker.com/engine/install/) with the Compose plugin.

### Option 1 – Docker Compose with the published image (recommended)

```bash
mkdir dostotinka && cd dostotinka

# Download the compose file and the example configuration
curl -fsSLO https://raw.githubusercontent.com/MrNechev/DoStotinka/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/MrNechev/DoStotinka/main/.env.example -o .env

# Set a strong database password
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 24)/" .env

docker compose up -d
```

Open **http://&lt;your-server&gt;:8742**, create your account – done. Images are published for
`linux/amd64` and `linux/arm64` (e.g. Raspberry Pi 4/5) at `ghcr.io/mrnechev/dostotinka`.

> Want to look around first? Click **“Explore the demo account”** on the login page
> (or log in as `demo@dostotinka.app` / `demo1234`).

### Option 2 – Build the image yourself with Docker

```bash
git clone https://github.com/MrNechev/DoStotinka.git
cd DoStotinka
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

> **Upgrading from 0.4 or older:** the app now listens on port **8742** (instead of 3000). Download
> the current `docker-compose.yml` (or change the port mapping in yours to
> `"${DOSTOTINKA_PORT:-8742}:8742"`) and update the port in your reverse proxy.

### After installing

- Create your account – the first account on a server becomes its **administrator**. Under
  *Administration* you can add accounts for your family and switch off public sign-ups (or set
  `ALLOW_REGISTRATION=false` in `.env`).
- Disable the demo account on private servers with `DEMO_ENABLED=false`.
- Put DoStotinka behind a reverse proxy with HTTPS if it is reachable from the internet (see below).

## Configuration

All settings are environment variables (set them in `.env` when using Docker Compose).

| Variable | Default | Description |
| --- | --- | --- |
| `DOSTOTINKA_PORT` | `8742` | Host port of the web app (Compose only). |
| `DOSTOTINKA_VERSION` | `latest` | Image tag to run (Compose only). |
| `DB_PASSWORD` | – | **Required.** PostgreSQL password. |
| `DB_USERNAME` | `dostotinka` | PostgreSQL user. |
| `DB_DATABASE_NAME` | `dostotinka` | PostgreSQL database. |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | Database host and port (Compose sets the host automatically). |
| `DATABASE_URL` | – | Full connection string; overrides the `DB_*` variables. |
| `DB_DATA_LOCATION` | `./postgres` | Where the database files are stored on the host (Compose only). |
| `ALLOW_REGISTRATION` | `true` | Allow new users to sign up (default; administrators can override it in the UI). The very first user can always register. |
| `DEMO_ENABLED` | `true` | Create the demo account with example data. |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | `demo@dostotinka.app` / `demo1234` | Credentials of the demo account. |
| `DEMO_RESET_HOURS` | `24` | Regenerate the demo data every N hours (`0` = only on start). |
| `SESSION_TTL_DAYS` | `30` | How long a login stays valid without activity. |
| `COOKIE_SECURE` | `auto` | `auto` = Secure cookie when the request came over HTTPS; or `true` / `false`. |
| `TRUST_PROXY` | `false` | Set to `true` (or a hop count / IP list) behind a reverse proxy. |
| `EXCHANGE_RATES_AUTO_UPDATE` | `true` | Fetch the daily ECB reference rates. |
| `EXCHANGE_RATES_URL` | ECB daily XML | Alternative source in the same format. |
| `NOTIFICATIONS_ENABLED` | `true` | Allow users to send payment reminders to a URL of their choice (ntfy, Gotify, Discord, Slack, webhook). Disable on servers with untrusted users. |
| `PUBLIC_URL` | – | Public address of the app (e.g. `https://money.example.com`); used for single sign-on and bank redirects. |
| `AUTOMATIC_IMPORT` | `true` | Offer the automatic import (phone notifications, open banking). Every user still switches it on for themselves. |
| `PRICE_UPDATES` | `true` | Update the prices of investments that use Yahoo Finance or CoinGecko every 6 hours (only the tickers are sent). `false` = typed-in prices only. |
| `UPDATE_CHECK` | `true` | Look for a new DoStotinka release once a day (one anonymous request to GitHub) and show it to administrators. |
| `ENCRYPTION_KEY` | – | Any long random string, used to encrypt the users' bank access keys in the database. Without it a key is generated and stored in the database itself. Keep it when moving the server. |
| `OIDC_ISSUER_URL` | – | OpenID Connect provider (issuer URL) – enables single sign-on, see below. |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | – | Client credentials registered at the provider. |
| `OIDC_SCOPE` | `openid email profile` | Requested scopes. |
| `OIDC_BUTTON_TEXT` | `Log in with SSO` | Label of the login button. |
| `OIDC_AUTO_REGISTER` | `true` | Create a user on the first SSO login (otherwise only existing users can log in). |
| `OIDC_LINK_BY_EMAIL` | `false` | Link an SSO login to an existing user with the same verified e-mail automatically. Only enable it when users cannot pick arbitrary e-mail addresses. |
| `ATTACHMENT_QUOTA_MB` | `1024` | Total size of attached files (receipts) per user; `0` = unlimited. |
| `API_DOCS` | `true` | Serve the OpenAPI documentation at `/api/docs`. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `20` | Login / registration attempts per IP and minute. |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `TZ` | `UTC` | Time zone of the container. |

### Single sign-on (OpenID Connect)

DoStotinka can use your identity provider (Authentik, Authelia, Keycloak, Zitadel, Pocket ID, Google
…) for logins:

1. Create an OAuth2 / OpenID Connect application (confidential client) at the provider with the
   redirect URI `https://money.example.com/api/auth/oidc/callback`.
2. Set `PUBLIC_URL`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` in `.env` and
   restart the container.

The login page then shows a “Log in with SSO” button. A first SSO login creates a new user
(`OIDC_AUTO_REGISTER`; independent of `ALLOW_REGISTRATION`). Existing users connect their account
once in **Settings → Security → Single sign-on** – DoStotinka does not hand an existing account to an
SSO login just because the e-mail matches, unless you enable `OIDC_LINK_BY_EMAIL`. Password logins
keep working. Two-factor login is left to the provider for SSO logins.

### Reverse proxy

DoStotinka is a normal HTTP service on port 8742. Example for **Caddy**:

```caddyfile
money.example.com {
    reverse_proxy localhost:8742
}
```

Example for **Nginx**:

```nginx
server {
    server_name money.example.com;
    location / {
        proxy_pass http://127.0.0.1:8742;
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
docker exec dostotinka_postgres pg_dump -U dostotinka dostotinka | gzip > dostotinka-$(date +%F).sql.gz
```

Restore into a fresh installation with
`gunzip -c backup.sql.gz | docker exec -i dostotinka_postgres psql -U dostotinka dostotinka`.
Every user can additionally download their own data (CSV / JSON) in **Settings → Your data** and
restore such a JSON backup there – also on a different DoStotinka server. The JSON backup does not
contain attached receipts; the database backup does.

## Development

Requirements: **Node.js 24+**, **pnpm 10** (`corepack enable`) and Docker (for PostgreSQL).

```bash
git clone https://github.com/MrNechev/DoStotinka.git && cd DoStotinka
pnpm install

# Start a development database
docker run -d --name dostotinka-dev-db -p 54329:5432 \
  -e POSTGRES_USER=dostotinka -e POSTGRES_PASSWORD=dostotinka -e POSTGRES_DB=dostotinka postgres:18-alpine
docker exec dostotinka-dev-db createdb -U dostotinka dostotinka_test   # for the tests

echo "DATABASE_URL=postgres://dostotinka:dostotinka@localhost:54329/dostotinka" > .env
echo "NODE_ENV=development" >> .env

pnpm dev   # API on http://localhost:8742, web app with hot reload on http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the API (auto-restart) and the Vite dev server. |
| `pnpm build` | Production build of the web app and the server. |
| `pnpm test` | Unit tests and API integration tests (needs the test database). |
| `pnpm typecheck` | TypeScript checks for all packages. |
| `pnpm lint` / `pnpm lint:fix` | Linting & formatting with Biome. |
| `pnpm db:generate` | Creates a SQL migration after changing `apps/server/src/db/schema.ts`. |
| `pnpm --filter @dostotinka/server demo:reset` | Regenerates the demo data. |

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
  android/       Android app (Kotlin): your server full-screen + notification import
  ios/           iPhone app (SwiftUI): your server full-screen + Shortcuts action
packages/
  shared/        Code shared by both: validation schemas, API types, categories, currencies,
                 money and recurrence helpers
docs/            Screenshots and additional documentation
```

More details for contributors are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### API

The web app talks to a documented JSON API under `/api`. Browse it interactively at
`http://<your-server>:8742/api/docs`. Create a personal API token in **Settings → API tokens** and
send it as `Authorization: Bearer <token>` – handy for scripts and phone automations (e.g. an iOS
Shortcut that logs a cash expense). All amounts are integers in minor units (cents). See
[docs/API.md](docs/API.md) for examples.

## Roadmap

**Next**

- [ ] **iPhone app in the App Store / TestFlight** (needs a paid Apple developer account) – until
  then it is installed with AltStore / SideStore or built with Xcode.

**Might do** – only if they turn out to be really needed (DoStotinka should stay simple)

- [ ] Split records – one receipt across several categories.
- [ ] Subscriptions – recurring payments found in the history, with their yearly cost.
- [ ] Budget rollover – money left in a monthly budget carries over to the next month.
- [ ] Cash-flow forecast – “safe to spend per day” until the next salary.
- [ ] Scan the QR code of Bulgarian fiscal receipts to fill in amount, date and time.
- [ ] Android home-screen widget and shortcuts for adding a record.
- [ ] Nightly backups on by default, with their status in the app.
- [ ] More languages (contributions welcome).
- [ ] Automatic import from bank e-mails (IMAP / Gmail).

**Done**

- [x] **iPhone app** (first version) – your server full-screen, offline entry, a Shortcuts action for
  card payments (0.9.0)
- [x] **Rules** and payee clean-up (0.9.0)
- [x] **Templates without amounts** and **note suggestions** (0.9.0)
- [x] **Offline entry** in the Android app, the iPhone app and the browser (0.9.0)
- [x] **Monthly review**, also sent with the reminders (0.9.0)
- [x] **Investments and net worth** (0.9.0)
- [x] “A new version is available” for administrators (0.9.0)
- [x] **Android app** that connects to your own server, with a built-in notification listener for
  the automatic import (0.7.0)
- [x] Saved CSV import profiles per bank (0.7.0)
- [x] Households – shared data for several users (0.8.0)
- [x] **Automatic transaction import** – phone notifications and open banking with an inbox for
  review (0.6.0). Background and research: [Automatic transaction import](docs/AUTOMATIC_IMPORT.md).
- [x] CSV import (from Wallet and bank statements)
- [x] Translations (Bulgarian first)
- [x] Attachments (receipts) and record templates
- [x] Notifications for upcoming payments

Ideas and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

DoStotinka is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
