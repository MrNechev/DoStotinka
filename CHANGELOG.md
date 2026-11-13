# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.0] – 2026-11-13

Upgrading: `docker compose pull && docker compose up -d`. The migrations add tables for rules and
investments and a few columns; no existing data changes. The Android app has an update too
(offline entry) – install the new APK over the old one.

### Added
- **Rules:** “payee, note or bank text contains *LIDL* → category *Groceries*, payee *Lidl*, note,
  labels”. They fill in the transactions of the inbox (phone notifications, bank connection) and of
  CSV imports, pick the category of a new record while you type and can be applied to past
  records. *Categories → Rules* (also linked from the inbox).
- **Payee clean-up:** rename or merge payees in all records, templates and planned payments.
- **Note suggestions:** notes written before are suggested while typing a note (Settings →
  Preferences to switch it off).
- **Monthly review** (*Statistics → Monthly review*): income, expenses and what was left, what was
  different from the months before, categories and top payees, the largest and unusual payments,
  the monthly budgets. Optionally sent with the reminders on the 1st of each month.
- **Net worth** (*Accounts → Net worth*): accounts, investments, property and open debts with the
  history of up to 10 years.
- **Investments:** holdings (ETFs, shares, funds, crypto …) in investment accounts with prices typed
  in or updated every 6 hours from Yahoo Finance or CoinGecko (`PRICE_UPDATES`). Investment
  accounts show their value including the gain. New account type **Property & valuables**.
- **Offline entry:** records added while the server cannot be reached are kept on the device and
  sent automatically later (each only once). The Android app keeps a copy of the web app and opens
  even when the server is not reachable – over plain http too.
- **iPhone app** (apps/ios): your server full-screen, offline entry and a Shortcuts action
  “Add payment to DoStotinka” for the Wallet *Transaction* automation, which sends card payments
  to the inbox. Releases include an unsigned `.ipa` for AltStore / SideStore.
- Administrators see when a **new version** is available (`UPDATE_CHECK`, once a day).
- Rules and holdings are part of the JSON backup.

### Changed
- Templates no longer store the amount unless *Also fill in the amount* is ticked; existing
  templates can drop their amount in Settings.

## [0.8.0] – 2026-11-13

Upgrading: `docker compose pull && docker compose up -d` (a small
migration adds a household column to the users and a table for invitations; no existing data
changes).

### Added
- **Households:** invite other users of the server by e-mail to work with your data (accounts,
  records, budgets …) using their own login. Personal settings, password, two-factor login and
  tokens stay personal; the main currency and restoring backups stay with the owner. Joining hides
  the member's own data, leaving brings it back. Reminders of members cover the shared planned
  payments.

## [0.7.0] – 2026-11-13

Upgrading the server: `docker compose pull && docker compose up -d` (a small migration adds the
import profiles). The Android app is new – see below.

### Added
- **Android app** ([apps/android](apps/android/README.md)): your own server full-screen without
  browser bars – asks for the server address on the first start (plain `http://` works) – with file
  uploads, downloads and the bank pages opening in the browser. It **imports payment
  notifications by itself**: in *Settings → Automatic import* tap **Use this phone**, allow
  notification access and choose the banking apps to forward; notifications are retried when the
  server is not reachable. *Settings → App* shows and changes the server. Release APKs are signed
  and attached to GitHub releases.
- In Android browsers *Settings* links to the app.
- **CSV import profiles:** save the column mapping, date format and accounts of an import; files with
  the same columns get them automatically next time.

## [0.6.0] – 2026-11-13

Upgrading: `docker compose pull && docker compose up -d`. The database migration (new tables for
the automatic import) runs automatically and changes no existing data. Optionally add
`ENCRYPTION_KEY=<long random string>` to `.env` (e.g. `openssl rand -hex 32`) **before** setting up a
bank connection – it encrypts the bank keys stored in the database.

### Added
- **Automatic import** of transactions, off by default and switchable per user – two ways that can
  be used together ([user guide](docs/USER_GUIDE.md#automatic-import)):
  - **Payment notifications from your phone:** MacroDroid, Tasker, iOS Shortcuts or any tool posts
    notifications of banking apps, Google Wallet or bank SMS to `POST /api/ingest/notification`
    with a per-phone token that can only add notifications. A parser reads amount, currency,
    direction and payee (English and Bulgarian, Latin-letter SMS, DSK/UBB/Revolut/Google Wallet
    styles) and skips one-time codes, declined and cancelled payments. Each app can be mapped to an
    account or switched off; unrecognised notifications are shown for two weeks.
  - **Bank connection (open banking)** through the user's own [Enable Banking](https://enablebanking.com)
    application (free for personal use): DSK, UBB, Revolut and 2,500+ European banks, read-only
    PSD2 access confirmed at the bank. Booked transactions and balances are fetched up to four
    times a day or on demand, consents can be renewed (reminder a week before they expire), bank
    accounts are matched to DoStotinka accounts (pre-selected by the bank logo). Works over plain
    http too: paste the address the bank sends you to.
  - **Inbox** for imported transactions with category suggestions from your history, editable
    account/type/category/payee, “add all ready”, a dashboard banner and a menu badge.
    Duplicates are caught (repeated notifications, the bank booking of a notified payment, Google
    Wallet + bank app), records you already entered are offered for linking, and money moving
    between two of your accounts can be saved as one transfer. Phones and bank connections can add
    records without review when nothing needs a decision.
- New settings `AUTOMATIC_IMPORT` (server-wide switch) and `ENCRYPTION_KEY`.

### Changed
- The research document [docs/AUTOMATIC_IMPORT.md](docs/AUTOMATIC_IMPORT.md) describes what was
  built and why; the roadmap moves on to more languages, the mobile app and households.
- Request logs mask `token=` query parameters.

## [0.5.2] – 2026-11-06

Upgrading: pull the new image and restart (`docker compose pull && docker compose up -d`). A small
database migration (the new account type) runs automatically on start; it changes no existing data.

### Added
- **Bank and voucher logos as account icons:** DSK Bank, UBB, Revolut, Pluxee and Edenred. They are
  shown on a white disc with a ring in the account's colour, so the colour still tells accounts
  apart. More banks can be added easily (see `apps/web/src/assets/brands/README.md`).
- **Food vouchers** account type for meal vouchers (Pluxee, Edenred …).

### Fixed
- Adding DoStotinka to the home screen of a phone now opens it full-screen even when it is served
  over plain `http://` (e.g. on a LAN or a Tailscale address). Before, browsers such as Vivaldi
  said the app could not be installed and opened it with the browser's address bar and tabs. The
  web app manifest now uses PNG icons only (with a 192 px maskable icon) and has an `id`. The user
  guide explains the difference between HTTP and HTTPS installs.
- On phones and tablets the category picker no longer focuses the search field, so the on-screen
  keyboard doesn't cover the category list. With a mouse it still does.

### Documentation
- Research on **automatic transaction import** (open banking via PSD2 for DSK, UBB and Revolut,
  phone notifications, Google Pay / Gmail, bank e-mails) and a proposed design:
  [docs/AUTOMATIC_IMPORT.md](docs/AUTOMATIC_IMPORT.md). It is the next item on the roadmap.

## [0.5.1] – 2026-11-04

### Changed
- **Slavotax is now called DoStotinka** (Bulgarian for “to the last cent”). Nothing else changed in
  this release. The repository moved to `MrNechev/DoStotinka` (old links redirect) and the Docker
  image to `ghcr.io/mrnechev/dostotinka`; `ghcr.io/mrnechev/slavotax` stays at 0.5.0.

  **Upgrading an existing installation:**
  1. `docker compose down` in your installation folder.
  2. Download the new `docker-compose.yml` (see the README).
  3. In your `.env`, rename `SLAVOTAX_PORT` to `DOSTOTINKA_PORT` and `SLAVOTAX_VERSION` to
     `DOSTOTINKA_VERSION`. Keep `DB_USERNAME` and `DB_DATABASE_NAME` as they are – if your `.env`
     does not set them, add `DB_USERNAME=slavotax` and `DB_DATABASE_NAME=slavotax` (the old defaults).
  4. `docker compose up -d`. Your data stays where it is.

  Everybody has to log in once more (the session cookie was renamed). Two-factor entries in
  authenticator apps keep working, backups made with Slavotax can still be restored, and the demo
  account moves to `demo@dostotinka.app`.

## [0.5.0] – 2026-11-04

### Changed
- **The default port is now 8742** instead of the very common 3000 (inside the container and as
  the published port). When upgrading, use the new `docker-compose.yml` or change the port
  mapping in yours to `"${SLAVOTAX_PORT:-8742}:8742"`, and update your reverse proxy.
- Translations are loaded on demand, so English users no longer download the Bulgarian dictionary.

### Added
- Dashboard card with open debts (owed to me / I owe) and overdue ones.
- Single sign-on with OpenID Connect (Authentik, Authelia, Keycloak, Google …): configure
  `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and `PUBLIC_URL`.

### Security
- Single sign-on no longer links a login to an existing account just because the e-mail matches
  (a user could have changed their e-mail to someone else's). Existing users connect SSO in
  Settings → Security; automatic linking is opt-in (`OIDC_LINK_BY_EMAIL`) and requires a verified
  e-mail. SSO identities are stored together with their provider.
- Two-factor login: five wrong codes block logging in for 15 minutes; turning it on requires the
  password; recovery codes also work without the dash.
- A per-user storage quota for attached files (`ATTACHMENT_QUOTA_MB`, default 1 GB).

### Fixed
- Debt records keep their type, and editing or deleting them reopens or settles the debt; they no
  longer appear in quick-add suggestions or in the “Uncategorized” filter.
- Deleting an account keeps the receipts of transfers on the other side of the transfer.
- The restore dialog says that attached files are deleted and that debts and templates are
  replaced too.
- Docker Compose passes every setting from `.env` to the app (previously only some were
  forwarded, e.g. `NOTIFICATIONS_ENABLED` had no effect). `PORT` and `NODE_ENV` stay fixed inside
  the container.

## [0.4.0] – 2026-11-04

### Added
- Debts: track money lent and borrowed per person, record repayments into or out of any account,
  see what is still open and when it is due. Debt records change account balances but are not
  counted as income or expenses.
- Two-factor login with an authenticator app (TOTP) and ten one-time recovery codes
  (Settings → Security). Administrators can switch it off for users who lost their phone.
- Record templates: save the values of a record as a template (“Save as template” in the record
  editor) and apply it with one tap; manage them in Settings. Templates are part of the JSON backup.
- Attach receipts and other files (photos, PDFs) to records. Photos are scaled down in the browser
  before uploading; a paperclip in the record list marks records with files.

### Fixed
- The Accounts page calls negative balances “Liabilities” (no longer “Debts”).
- Import: records in a currency without an exchange rate yet are now converted (the currency is
  tracked automatically); amounts like `€-12,50`, `EUR -12.50` or `−12.50` are read as negative;
  accounts that only receive transfers get the currency from the file; the preview shows amounts
  in their own currency.
- “All time” also includes records dated in the future.
- Statistics → Records links show exactly the records of a slice (“Food (general)” no longer
  includes the subcategories; “Uncategorized” filters uncategorized records).
- Ticking every account in the account filter no longer drops accounts excluded from statistics.
- The category breakdown no longer overflows its card on medium-sized screens.
- Keyboard: the edit dialog keeps the focus (pressing <kbd>N</kbd> no longer replaces it), category
  groups can be expanded with the keyboard, the “clear category” button is a real button.
- A malformed period in the URL no longer breaks the page.
- Quick-add suggestions reset a previously chosen foreign currency.
- Weekly charts start weeks on the first day of the week chosen in Settings (Sunday/Saturday).
- Confirming a planned payment from an account in another currency converts the amount.
- Adding to a savings goal shows an error for an invalid amount instead of doing nothing.
- The record editor no longer grows wider than its dialog when there are many suggestions.
- Remaining untranslated texts (budgets, goals, import, report, record type switch …); a test now
  fails when English text is written directly into the interface.

## [0.3.0] – 2026-11-04

### Added
- Reminders and server messages follow the user's language.
- Reorder categories (move up / down) on the categories page.
- Bulgarian translation of the whole interface, the default categories and dates; the language
  follows the browser and can be changed in Settings or on the login page.
- Daily reminders for overdue and upcoming planned payments via ntfy, Gotify, Discord, Slack or a
  JSON webhook (Settings → Reminders; disable server-wide with `NOTIFICATIONS_ENABLED=false`).

### Fixed
- Import converts records whose currency differs from their account's currency.
- Demo visitors no longer see each other's sessions and cannot change the shared profile.

## [0.2.0] – 2026-11-04

### Added
- Restore a JSON backup from Settings (replaces your data; also works on another server).
- Optional nightly database backup service in Docker Compose (`--profile backup`).
- More everyday categories: laundry & dry cleaning, repairs & tailoring, driving lessons, own
  bicycle, funerals & memorials (for new users).
- Personal API tokens (Settings → API tokens) and an API guide with an iOS Shortcuts recipe.
- CSV export of the Records page uses the current filters.
- Month-end forecast on the dashboard based on today's balance and open planned payments.
- Badge with the number of overdue planned payments in the navigation.
- End-to-end browser tests (Playwright) in CI.
- Guide for moving from Wallet by BudgetBakers.
- Records can be entered in another currency than the account's (e.g. when travelling); the amount
  is converted with your exchange rates and the original amount is kept in the note.
- Click a bar segment in “Spending over time” to see the records behind it.
- The records list loads more records automatically while scrolling.
- Service worker for the installable web app (faster start, offline shell; data is never cached).

### Fixed
- Forms opened right after a page load could keep an empty account.
- `PATCH /api/accounts/:id` reset fields that were not sent (starting balance, archived, note …).
- Editing a finished planned payment re-opened occurrences that had already been paid.
- Confirming the same planned occurrence twice (double click or together with the automatic job)
  could create two records.
- Import: cross-currency transfers without a received amount are now converted, and identical rows
  inside one file are no longer dropped as duplicates.
- “vs previous period” compares calendar months/weeks/years with the previous calendar period
  (month-to-date while a month is running) instead of a shifted window.
- Invalid time zones are rejected and can no longer break automatic planned payments.
- The JSON backup now contains savings goals.
- Several invalid requests returned 500 instead of 400.

## [0.1.0] – 2026-11-04

First alpha release.

### Added
- User registration and login with session cookies or bearer tokens, session management.
- Accounts of different types and currencies with starting balance, balance adjustment, archiving,
  exclusion from statistics and ordering.
- Expense, income and transfer records with categories, payees, notes, labels, date and time.
- Default category tree with 30 groups and 232 subcategories for expenses and income; custom
  categories, icons and colours.
- Statistics: income/expense summary with previous-period comparison, category donut with
  drill-down, stacked spending over time, cash flow and balance trend for any period and any set of
  accounts.
- Account detail pages with per-account statistics.
- Planned payments (one-time and recurring) with pay / skip and overdue tracking.
- Calendar view of daily spending and due payments.
- Budgets per week, month or year with history.
- Multi-currency support with ECB exchange rates and manual rates.
- CSV export and full JSON backup.
- Demo account with a year of generated example data.
- Docker image (amd64/arm64), Docker Compose setup and OpenAPI documentation.
- CSV import with automatic detection of Wallet by BudgetBakers exports, category matching,
  transfer pairing, account mapping and duplicate detection.
- Totals (income, expenses, cash flow, count) for any record filter on the Records page.
- Report table on the Statistics page: income and expenses per category and month/week with
  totals, averages, cash flow and expandable subcategories.
- “Duplicate” action in the record editor.
- Quick-add suggestions in the record editor based on your most frequent records.
- Automatic planned payments that are recorded on their due date.
- Savings goals with target date, monthly saving suggestion and progress from manual contributions or
  from the balance of a linked account.
- Searching records by amount.
- Administration page: the first user becomes administrator and can create users, reset passwords,
  grant admin rights, delete users and open/close sign-ups without editing `.env`.
- “Getting started” checklist on the dashboard for new users.
- Bulk editing on the Records page: select records to change their category, move them to another
  account, add/remove labels or delete them.

[Unreleased]: https://github.com/MrNechev/DoStotinka/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/MrNechev/DoStotinka/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/MrNechev/DoStotinka/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/MrNechev/DoStotinka/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/MrNechev/DoStotinka/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/MrNechev/DoStotinka/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/MrNechev/DoStotinka/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/MrNechev/DoStotinka/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/MrNechev/DoStotinka/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MrNechev/DoStotinka/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MrNechev/DoStotinka/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MrNechev/DoStotinka/releases/tag/v0.1.0
