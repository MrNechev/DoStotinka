# Contributing to DoStotinka

Thanks for your interest in improving DoStotinka! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and requesting features

Use the [issue tracker](https://github.com/MrNechev/DoStotinka/issues). For bugs please include the
DoStotinka version (bottom of the Settings page), steps to reproduce and – if relevant – the output of
`docker compose logs dostotinka`. Please report security issues privately, see [SECURITY.md](SECURITY.md).

## Development setup

See the *Development* section of the [README](README.md#development). In short:

```bash
pnpm install
pnpm dev
```

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep changes focused – one feature or fix per pull request.
3. Make sure these pass locally:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
4. If you change the database schema (`apps/server/src/db/schema.ts`) run `pnpm db:generate` and
   commit the generated migration in `apps/server/drizzle/`. Never edit a migration that has already
   been released.
5. Add or update tests for behaviour changes (API tests live in `apps/server/test`, unit tests next
   to the shared code in `packages/shared/test`, browser end-to-end tests in `tests/e2e`).
   Run the end-to-end tests against a running instance with
   `E2E_BASE_URL=http://localhost:5173 pnpm --filter @dostotinka/e2e test:e2e`
   (first time: `pnpm --filter @dostotinka/e2e exec playwright install chromium`).
6. For UI changes, check light and dark mode and a phone-sized screen, and add a screenshot to the PR.

## Code style

- TypeScript everywhere, formatted and linted with [Biome](https://biomejs.dev) (`pnpm lint:fix`).
- API input is validated with Zod schemas from `packages/shared` – the same schemas are used by the
  web app, so add new request shapes there.
- Money is always stored and transferred as integers in minor units (cents). Use the helpers in
  `packages/shared/src/money.ts` for parsing, formatting and conversion.
- Keep the UI simple. DoStotinka exists because other budget apps are overloaded – new features should
  stay out of the way of the everyday flow (add a record, look at statistics).

## Translations

The web app is translated with a tiny gettext-style helper (`apps/web/src/i18n`): the English text
is the key, e.g. `t('Add record')`, `t('Due in {n} days', { n })` or
`tn(n, '{n} record', '{n} records')`. To add a language:

1. Copy `apps/web/src/i18n/bg.ts` to a new file (e.g. `de.ts`) and translate the values – keep the
   `{placeholders}` unchanged.
2. Register it in `apps/web/src/i18n/index.ts` (`LANGUAGES`, `dictionaries` and the `date-fns`
   locale).
3. Run `pnpm --filter @dostotinka/web test` – it fails when a UI string or a default category has no
   translation, or when placeholders do not match.

When you add UI text, wrap it in `t()` and add the Bulgarian translation to `bg.ts`.

## Commit messages

Use short, imperative subject lines (“Add CSV import”, “Fix transfer editing”). Reference issues in
the body when relevant.

By contributing you agree that your contributions are licensed under the AGPL-3.0 license of the
project.
