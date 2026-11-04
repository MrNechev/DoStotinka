# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Attach receipts and other files (photos, PDFs) to records. Photos are scaled down in the browser
  before uploading; a paperclip in the record list marks records with files.

### Fixed
- The record type switch (Expense / Income / Transfer) was not translated.

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

[Unreleased]: https://github.com/MrNechev/slavotax/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/MrNechev/slavotax/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MrNechev/slavotax/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MrNechev/slavotax/releases/tag/v0.1.0
