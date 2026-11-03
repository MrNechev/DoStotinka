# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- CSV import with automatic detection of Wallet by BudgetBakers exports, category matching,
  transfer pairing, account mapping and duplicate detection.
- Totals (income, expenses, cash flow, count) for any record filter on the Records page.
- Report table on the Statistics page: income and expenses per category and month/week with
  totals, averages, cash flow and expandable subcategories.
- “Duplicate” action in the record editor.

### Changed
- Smaller web bundle: validation schemas are no longer shipped to the browser.

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

[Unreleased]: https://github.com/MrNechev/slavotax/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MrNechev/slavotax/releases/tag/v0.1.0
