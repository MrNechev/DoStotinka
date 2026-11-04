import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  type AccountType,
  CURRENCIES,
  type CurrenciesResponse,
  convertMinor,
  type ImportRecordInput,
  type ImportResult,
  isSupportedCurrency,
  toMinor,
} from '@slavotax/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '@/api/client';
import {
  invalidateFinancialData,
  qk,
  useAccounts,
  useCategories,
  useCurrencies,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { Badge, Card, Checkbox, PageHeader } from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { buildCategoryIndex, type CategoryIndex } from '@/lib/categories';
import { parseCsv } from '@/lib/csv';
import { fmt } from '@/lib/date';
import { money, plural } from '@/lib/format';
import {
  type ColumnMapping,
  type DateFormat,
  guessMapping,
  isWalletExport,
  parseAmountValue,
  parseDateValue,
  suggestCategory,
  typeFromValue,
} from '@/lib/import-formats';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'columns' | 'accounts' | 'categories' | 'review' | 'done';
const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: t('File') },
  { id: 'columns', label: t('Columns') },
  { id: 'accounts', label: t('Accounts') },
  { id: 'categories', label: t('Categories') },
  { id: 'review', label: t('Import') },
];
const FIXED_ACCOUNT = '__single_account__';

/** Currency an amount of the file is written in (falls back to the account currency). */
function rowCurrency(d: { currency: string | null }, accountCurrency: string) {
  return d.currency && isSupportedCurrency(d.currency) ? d.currency : accountCurrency;
}

interface Draft {
  accountKey: string;
  currency: string | null;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  date: Date;
  categoryName: string;
  note: string;
  payee: string;
  labels: string[];
  toAccountKey?: string;
  toAmount?: number;
  /** Currency of the receiving side of a transfer (from its own row). */
  toCurrency?: string | null;
}

type AccountChoice =
  | { mode: 'existing'; id: string }
  | { mode: 'create'; name: string; currency: string; type: AccountType };

const FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean; hint?: string }[] = [
  { key: 'date', label: t('Date'), required: true },
  {
    key: 'amount',
    label: t('Amount'),
    required: true,
    hint: t('Negative numbers are expenses unless a type column says otherwise.'),
  },
  {
    key: 'account',
    label: t('Account'),
    hint: t('Leave empty to import everything into one account.'),
  },
  { key: 'currency', label: t('Currency') },
  { key: 'type', label: t('Type (expense / income)') },
  { key: 'category', label: t('Category') },
  { key: 'note', label: t('Note / description') },
  { key: 'payee', label: t('Payee') },
  { key: 'labels', label: t('Labels') },
  {
    key: 'transfer',
    label: t('Transfer flag'),
    hint: t('Wallet marks both sides of transfers with “true”.'),
  },
];

function buildDrafts(rows: string[][], mapping: ColumnMapping, dateFormat: DateFormat) {
  const drafts: Draft[] = [];
  const errors: number[] = [];
  const transfers: Draft[] = [];
  const cell = (row: string[], idx: number) => (idx >= 0 ? (row[idx] ?? '').trim() : '');
  rows.forEach((row, i) => {
    const date = parseDateValue(cell(row, mapping.date), dateFormat);
    const amount = parseAmountValue(cell(row, mapping.amount));
    if (!date || amount === null || amount === 0) {
      errors.push(i + 2);
      return;
    }
    const currency = cell(row, mapping.currency).toUpperCase();
    const draft: Draft = {
      accountKey: mapping.account >= 0 ? cell(row, mapping.account) || 'Imported' : FIXED_ACCOUNT,
      currency: isSupportedCurrency(currency) ? currency : null,
      type: typeFromValue(cell(row, mapping.type), amount),
      amount: Math.abs(amount),
      date,
      categoryName: cell(row, mapping.category),
      note: cell(row, mapping.note),
      payee: cell(row, mapping.payee),
      labels: cell(row, mapping.labels)
        .split(/[|,;]/)
        .map((l) => l.trim())
        .filter(Boolean),
    };
    if (/^(true|1|yes)$/i.test(cell(row, mapping.transfer))) transfers.push(draft);
    else drafts.push(draft);
  });
  // Pair the two halves of each transfer (same time, opposite direction, different accounts).
  const used = new Set<Draft>();
  for (const out of transfers) {
    if (used.has(out) || out.type !== 'expense') continue;
    const match = transfers.find(
      (cand) =>
        !used.has(cand) &&
        cand !== out &&
        cand.type === 'income' &&
        cand.accountKey !== out.accountKey &&
        Math.abs(cand.date.getTime() - out.date.getTime()) < 60_000,
    );
    if (!match) continue;
    used.add(out);
    used.add(match);
    drafts.push({
      ...out,
      type: 'transfer',
      toAccountKey: match.accountKey,
      toAmount: match.amount,
      toCurrency: match.currency,
      categoryName: '',
    });
  }
  for (const leftover of transfers) {
    if (!used.has(leftover))
      drafts.push({ ...leftover, categoryName: '', note: leftover.note || t('Transfer') });
  }
  drafts.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { drafts, errors };
}

function CategorySelect({
  value,
  onChange,
  index,
}: {
  value: string;
  onChange: (v: string) => void;
  index: CategoryIndex;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9"
      containerClassName="w-full sm:w-72"
    >
      <option value="">{t('— Uncategorized —')}</option>
      {(['expense', 'income'] as const).map((kind) =>
        index.topLevel(kind).map((g) => (
          <optgroup key={g.id} label={`${kind === 'income' ? `${t('Income')} · ` : ''}${g.name}`}>
            <option value={g.id}>{g.name}</option>
            {index.childrenOf(g.id).map((c) => (
              <option key={c.id} value={c.id}>
                {g.name} › {c.name}
              </option>
            ))}
          </optgroup>
        )),
      )}
    </Select>
  );
}

export default function ImportPage() {
  const user = useUser();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: categories } = useCategories();
  const { data: currencies } = useCurrencies();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(
    null,
  );
  const [wallet, setWallet] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');
  const [accountChoices, setAccountChoices] = useState<Record<string, AccountChoice>>({});
  const [categoryChoices, setCategoryChoices] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const built = useMemo(
    () =>
      file && mapping ? buildDrafts(file.rows, mapping, dateFormat) : { drafts: [], errors: [] },
    [file, mapping, dateFormat],
  );

  const accountKeys = useMemo(() => {
    const map = new Map<string, { count: number; currency: string | null }>();
    for (const d of built.drafts) {
      for (const key of [d.accountKey, d.toAccountKey].filter((k): k is string => !!k)) {
        const entry = map.get(key) ?? { count: 0, currency: null };
        entry.count++;
        const currency = key === d.accountKey ? d.currency : d.toCurrency;
        if (!entry.currency && currency) entry.currency = currency;
        map.set(key, entry);
      }
    }
    return [...map.entries()];
  }, [built.drafts]);

  const categoryKeys = useMemo(() => {
    const map = new Map<string, { name: string; kind: 'expense' | 'income'; count: number }>();
    for (const d of built.drafts) {
      if (d.type === 'transfer' || !d.categoryName) continue;
      const key = `${d.type}|${d.categoryName}`;
      const entry = map.get(key) ?? { name: d.categoryName, kind: d.type, count: 0 };
      entry.count++;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [built.drafts]);

  const onFile = async (f: File) => {
    setError(null);
    const text = await f.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setError(t('The file does not contain any rows.'));
      return;
    }
    const headers = rows[0]!.map((h) => h.trim());
    setFile({ name: f.name, headers, rows: rows.slice(1) });
    setWallet(isWalletExport(headers));
    setMapping(guessMapping(headers));
    setStep('columns');
  };

  const prepareAccounts = () => {
    const next: Record<string, AccountChoice> = {};
    for (const [key, info] of accountKeys) {
      const existing = accountChoices[key];
      if (existing) {
        next[key] = existing;
        continue;
      }
      const sameName = accounts.find((a) => a.name.toLowerCase() === key.toLowerCase());
      if (key === FIXED_ACCOUNT) {
        next[key] = accounts[0]
          ? { mode: 'existing', id: accounts[0].id }
          : { mode: 'create', name: 'Imported', currency: user.baseCurrency, type: 'checking' };
      } else if (sameName) {
        next[key] = { mode: 'existing', id: sameName.id };
      } else {
        next[key] = {
          mode: 'create',
          name: key.slice(0, 60),
          currency: info.currency ?? user.baseCurrency,
          type: /cash|в брой|кеш/i.test(key)
            ? 'cash'
            : /saving|спестов/i.test(key)
              ? 'savings'
              : /card|карта/i.test(key)
                ? 'credit_card'
                : 'checking',
        };
      }
    }
    setAccountChoices(next);
    setStep('accounts');
  };

  const prepareCategories = () => {
    const next: Record<string, string> = {};
    for (const [key, info] of categoryKeys) {
      next[key] = categoryChoices[key] ?? suggestCategory(info.name, info.kind, index) ?? '';
    }
    setCategoryChoices(next);
    setStep(categoryKeys.length ? 'categories' : 'review');
  };

  const currencyOfKey = (key: string) => {
    const choice = accountChoices[key];
    if (!choice) return user.baseCurrency;
    if (choice.mode === 'existing')
      return accounts.find((a) => a.id === choice.id)?.currency ?? user.baseCurrency;
    return choice.currency;
  };

  const runImport = useMutation({
    mutationFn: async () => {
      const keys = accountKeys.map(([k]) => k);
      const payloadAccounts = keys.map((key) => {
        const c = accountChoices[key]!;
        return c.mode === 'existing'
          ? { key, existingId: c.id }
          : { key, create: { name: c.name, type: c.type, currency: c.currency, color: '#3B82F6' } };
      });
      // Records in another currency than their account are converted. Start tracking currencies
      // that have no exchange rate yet (the server fills in the reference rate) and reload them.
      let rateSource = currencies;
      const tracked = new Set([
        rateSource?.baseCurrency,
        ...(rateSource?.rates.map((r) => r.currency) ?? []),
      ]);
      const missing = new Set<string>();
      for (const d of built.drafts) {
        for (const code of [d.currency, currencyOfKey(d.accountKey)]) {
          if (code && !tracked.has(code) && isSupportedCurrency(code)) missing.add(code);
        }
      }
      for (const currency of missing) {
        rateSource = await api<CurrenciesResponse>('/currencies/rates', {
          method: 'POST',
          body: { currency },
        });
      }
      if (missing.size) void qc.invalidateQueries({ queryKey: qk.currencies });
      const rateMap: Record<string, number> = {};
      if (rateSource) {
        rateMap[rateSource.baseCurrency] = 1;
        for (const r of rateSource.rates) rateMap[r.currency] = r.rate;
      }
      const records: ImportRecordInput[] = built.drafts.map((d) => {
        const currency = currencyOfKey(d.accountKey);
        // A record in another currency than its account (e.g. a USD purchase on a EUR card) is
        // converted with the exchange rates; the original amount is kept in the note.
        const foreign =
          d.type !== 'transfer' &&
          d.currency &&
          d.currency !== currency &&
          d.currency in rateMap &&
          currency in rateMap;
        const minor = foreign
          ? convertMinor(toMinor(d.amount, d.currency!), d.currency!, currency, rateMap)
          : toMinor(d.amount, currency);
        const note = foreign
          ? [
              d.note,
              t('Paid {amount}', { amount: money(toMinor(d.amount, d.currency!), d.currency!) }),
            ]
              .filter(Boolean)
              .join(' · ')
          : d.note;
        const base = {
          accountKey: d.accountKey,
          amount: Math.max(1, minor),
          occurredAt: d.date.toISOString(),
          note: note || null,
          payee: d.payee || null,
          labels: d.labels,
        };
        if (d.type === 'transfer') {
          const toCurrency = currencyOfKey(d.toAccountKey!);
          return {
            ...base,
            type: 'transfer',
            toAccountKey: d.toAccountKey,
            toAmount: Math.max(1, toMinor(d.toAmount ?? d.amount, toCurrency)),
          };
        }
        return {
          ...base,
          type: d.type,
          categoryId: categoryChoices[`${d.type}|${d.categoryName}`] || null,
        };
      });
      return api<ImportResult>('/import/records', {
        method: 'POST',
        body: { accounts: payloadAccounts, records, skipDuplicates },
      });
    },
    onSuccess: (res) => {
      setResult(res);
      setStep('done');
      void invalidateFinancialData(qc);
      void qc.invalidateQueries({ queryKey: qk.labels });
      void qc.invalidateQueries({ queryKey: qk.currencies });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let transfers = 0;
    for (const d of built.drafts) {
      if (d.type === 'transfer') transfers++;
      else if (d.type === 'income') income++;
      else expense++;
    }
    const first = built.drafts[0]?.date;
    const last = built.drafts[built.drafts.length - 1]?.date;
    return { income, expense, transfers, first, last };
  }, [built.drafts]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('Import records')}
        description={t(
          'Bring your history from a CSV file – for example an export from Wallet by BudgetBakers or your bank.',
        )}
      />

      {step !== 'done' && (
        <ol className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                  i < stepIndex
                    ? 'bg-primary text-primary-foreground'
                    : i === stepIndex
                      ? 'bg-primary-soft text-primary ring-1 ring-primary'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <span className={cn(i === stepIndex ? 'font-medium' : 'text-muted-foreground')}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {step === 'upload' && (
        <Card className="p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-14 text-center transition-colors hover:border-primary hover:bg-primary-soft/40">
            <FileUp className="size-10 text-muted-foreground" />
            <span className="font-medium">{t('Choose a CSV file')}</span>
            <span className="max-w-md text-sm text-muted-foreground">
              {t(
                'Comma, semicolon or tab separated. The file is read in your browser – only the records you confirm are sent to your server.',
              )}
            </span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
          </label>
          <div className="mt-5 flex gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium text-foreground">{t('Coming from Wallet?')}</span>{' '}
              {t('In the Wallet web app open')} <em>{t('Records → Export')}</em>{' '}
              {t(
                "and download your records as CSV. Slavotax recognises the format automatically, matches Wallet's categories and pairs transfers between accounts.",
              )}{' '}
              <a
                href="https://github.com/MrNechev/slavotax/blob/main/docs/MIGRATING_FROM_WALLET.md"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                {t('Step-by-step guide')}
              </a>
            </p>
          </div>
        </Card>
      )}

      {step === 'columns' && file && mapping && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="font-medium">{file.name}</span>
            <Badge>{tn(file.rows.length, '{n} row', '{n} rows')}</Badge>
            {wallet && <Badge tone="success">{t('Wallet export detected')}</Badge>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.hint}>
                <Select
                  value={mapping[f.key]}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}
                >
                  <option value={-1}>{t('— not in file —')}</option>
                  {file.headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={i}>
                      {h || t('Column {n}', { n: i + 1 })}{' '}
                      {file.rows[0]?.[i] ? `(e.g. ${file.rows[0][i]!.slice(0, 24)})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field
              label={t('Date format')}
              hint={t('Only needed for ambiguous dates like 05/06/2024.')}
            >
              <Select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormat)}
              >
                <option value="auto">{t('Detect automatically')}</option>
                <option value="ymd">{t('Year-Month-Day')}</option>
                <option value="dmy">{t('Day.Month.Year')}</option>
                <option value="mdy">{t('Month/Day/Year')}</option>
              </Select>
            </Field>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {tn(built.drafts.length, '{n} record ready', '{n} records ready')}
            {built.errors.length > 0 && (
              <span className="text-warning">
                {' '}
                ·{' '}
                {tn(
                  built.errors.length,
                  '{n} row will be skipped (unreadable date or amount, e.g. line {lines})',
                  '{n} rows will be skipped (unreadable date or amount, e.g. line {lines})',
                  { lines: built.errors.slice(0, 3).join(', ') },
                )}
              </span>
            )}
          </p>
          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep('upload')}>
              <ArrowLeft /> {t('Back')}
            </Button>
            <Button
              onClick={prepareAccounts}
              disabled={mapping.date < 0 || mapping.amount < 0 || !built.drafts.length}
            >
              {t('Next')} <ArrowRight />
            </Button>
          </div>
        </Card>
      )}

      {step === 'accounts' && (
        <Card className="p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            {t('Choose where the records of each account in the file should go.')}
          </p>
          <div className="grid gap-3">
            {accountKeys.map(([key, info]) => {
              const choice = accountChoices[key];
              if (!choice) return null;
              const setChoice = (c: AccountChoice) =>
                setAccountChoices({ ...accountChoices, [key]: c });
              return (
                <div
                  key={key}
                  className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-medium">{key === FIXED_ACCOUNT ? t('All records') : key}</p>
                    <p className="text-xs text-muted-foreground">
                      {plural(info.count, 'record')}
                      {info.currency ? ` · ${info.currency}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={choice.mode === 'existing' ? choice.id : '__new'}
                      onChange={(e) =>
                        e.target.value === '__new'
                          ? setChoice({
                              mode: 'create',
                              name: key === FIXED_ACCOUNT ? t('Imported') : key.slice(0, 60),
                              currency: info.currency ?? user.baseCurrency,
                              type: 'checking',
                            })
                          : setChoice({ mode: 'existing', id: e.target.value })
                      }
                      className="h-9"
                      containerClassName="w-56"
                    >
                      <option value="__new">{t('+ Create new account')}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </Select>
                    {choice.mode === 'create' && (
                      <>
                        <Select
                          value={choice.type}
                          onChange={(e) =>
                            setChoice({ ...choice, type: e.target.value as AccountType })
                          }
                          className="h-9"
                          containerClassName="w-40"
                        >
                          {ACCOUNT_TYPES.map((at) => (
                            <option key={at} value={at}>
                              {t(ACCOUNT_TYPE_LABELS[at])}
                            </option>
                          ))}
                        </Select>
                        <Select
                          value={choice.currency}
                          onChange={(e) => setChoice({ ...choice, currency: e.target.value })}
                          className="h-9"
                          containerClassName="w-28"
                        >
                          {CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </Select>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep('columns')}>
              <ArrowLeft /> {t('Back')}
            </Button>
            <Button onClick={prepareCategories}>
              {t('Next')} <ArrowRight />
            </Button>
          </div>
        </Card>
      )}

      {step === 'categories' && (
        <Card className="p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            {t(
              'We matched the categories of your file to Slavotax categories. Check the suggestions and adjust them if needed.',
            )}
          </p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {categoryKeys.map(([key, info]) => (
              <div
                key={key}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{info.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {info.kind === 'income' ? t('Income') : t('Expense')} ·{' '}
                    {plural(info.count, 'record')}
                  </p>
                </div>
                <CategorySelect
                  value={categoryChoices[key] ?? ''}
                  onChange={(v) => setCategoryChoices({ ...categoryChoices, [key]: v })}
                  index={index}
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep('accounts')}>
              <ArrowLeft /> {t('Back')}
            </Button>
            <Button onClick={() => setStep('review')}>
              {t('Next')} <ArrowRight />
            </Button>
          </div>
        </Card>
      )}

      {step === 'review' && (
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t('Expenses'), value: totals.expense },
              { label: t('Incomes'), value: totals.income },
              { label: t('Transfers'), value: totals.transfers },
              {
                label: t('New accounts'),
                value: Object.values(accountChoices).filter((c) => c.mode === 'create').length,
              },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl bg-muted/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                <p className="text-xl font-semibold">{tile.value}</p>
              </div>
            ))}
          </div>
          {totals.first && totals.last && (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('From {from} to {to}', {
                from: fmt(totals.first, 'd MMM yyyy'),
                to: fmt(totals.last, 'd MMM yyyy'),
              })}
            </p>
          )}
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('Date')}</th>
                  <th className="px-3 py-2 font-medium">{t('Account')}</th>
                  <th className="px-3 py-2 font-medium">{t('Category')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {built.drafts
                  .slice(-8)
                  .reverse()
                  .map((d, i) => {
                    const currency = currencyOfKey(d.accountKey);
                    const catId = categoryChoices[`${d.type}|${d.categoryName}`];
                    return (
                      <tr key={i}>
                        <td className="whitespace-nowrap px-3 py-2">
                          {fmt(d.date, 'd MMM yyyy HH:mm')}
                        </td>
                        <td className="px-3 py-2">
                          {d.accountKey === FIXED_ACCOUNT ? t('Imported') : d.accountKey}
                          {d.toAccountKey ? ` → ${d.toAccountKey}` : ''}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {d.type === 'transfer'
                            ? t('Transfer')
                            : catId
                              ? index.pathOf(catId)
                              : t('Uncategorized')}
                        </td>
                        <td
                          className={cn(
                            'tabular whitespace-nowrap px-3 py-2 text-right font-medium',
                            d.type === 'expense'
                              ? 'text-expense'
                              : d.type === 'income'
                                ? 'text-income'
                                : '',
                          )}
                        >
                          {money(
                            toMinor(
                              d.type === 'expense' ? -d.amount : d.amount,
                              rowCurrency(d, currency),
                            ),
                            rowCurrency(d, currency),
                            { sign: d.type === 'transfer' ? 'auto' : 'exceptZero' },
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('Showing the 8 newest records.')}</p>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <Checkbox
              checked={skipDuplicates}
              onCheckedChange={(v) => setSkipDuplicates(v === true)}
            />
            {t('Skip records that already exist (same account, time and amount)')}
          </label>
          <div className="mt-6 flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(categoryKeys.length ? 'categories' : 'accounts')}
            >
              <ArrowLeft /> {t('Back')}
            </Button>
            <Button onClick={() => runImport.mutate()} loading={runImport.isPending}>
              {tn(built.drafts.length, 'Import {n} record', 'Import {n} records')}
            </Button>
          </div>
        </Card>
      )}

      {step === 'done' && result && (
        <Card className="flex flex-col items-center p-10 text-center">
          <CheckCircle2 className="size-14 text-income" />
          <h2 className="mt-4 text-xl font-semibold">{t('Import finished')}</h2>
          <p className="mt-2 text-muted-foreground">
            {[
              tn(result.imported, '{n} record imported', '{n} records imported'),
              result.skipped > 0 &&
                tn(result.skipped, '{n} duplicate skipped', '{n} duplicates skipped'),
              result.accountsCreated > 0 &&
                tn(result.accountsCreated, '{n} account created', '{n} accounts created'),
              result.labelsCreated > 0 &&
                tn(result.labelsCreated, '{n} label created', '{n} labels created'),
            ]
              .filter(Boolean)
              .join(', ')}
            .
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {t(
              'Tip: check the balances of the imported accounts and use “Adjust balance” if they differ from reality.',
            )}
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild variant="outline">
              <Link to="/accounts">{t('Check accounts')}</Link>
            </Button>
            <Button asChild>
              <Link to="/records">{t('View records')}</Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
