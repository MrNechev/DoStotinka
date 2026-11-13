import { convertMinor } from '@dostotinka/shared';
import { addMonths, startOfHour, startOfMonth, subDays } from 'date-fns';
import { ArrowRight, ClipboardList, Inbox, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  useAccounts,
  useBudgets,
  useCurrencies,
  useDebts,
  useGoals,
  useRecords,
  useUser,
} from '@/api/queries';
import { AccountCard } from '@/components/accounts/account-card';
import { MonthEndForecast } from '@/components/dashboard/forecast';
import { GettingStarted } from '@/components/dashboard/getting-started';
import { useInboxBadge } from '@/components/layout/app-shell';
import { UpcomingList } from '@/components/planned/upcoming-list';
import { useRecordEditor } from '@/components/records/record-editor';
import { RecordRow, useRecordLookups } from '@/components/records/record-list';
import {
  BalanceChart,
  CashflowChart,
  CategoryBreakdown,
  KpiTiles,
} from '@/components/stats/charts';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Card, CardHeader, EmptyState, ProgressBar, Skeleton } from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { fmt } from '@/lib/date';
import { money, percent } from '@/lib/format';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return t('Good night');
  if (h < 12) return t('Good morning');
  if (h < 18) return t('Good afternoon');
  return t('Good evening');
}

/** Open debts at a glance: what others owe me and what I owe (base currency). */
function DebtsSummary() {
  const user = useUser();
  const { data: debts = [] } = useDebts();
  const { data: currencies } = useCurrencies();
  const open = debts.filter((d) => !d.closedAt && d.outstanding > 0);
  if (!open.length) return null;
  const rates: Record<string, number> = { [user.baseCurrency]: 1 };
  for (const r of currencies?.rates ?? []) rates[r.currency] = r.rate;
  const sum = (direction: 'lent' | 'borrowed') =>
    open
      .filter((d) => d.direction === direction)
      .reduce((s, d) => s + convertMinor(d.outstanding, d.currency, user.baseCurrency, rates), 0);
  const overdue = open.filter((d) => d.dueDate && d.dueDate < fmt(new Date(), 'yyyy-MM-dd')).length;
  return (
    <Card>
      <CardHeader
        title={t('Debts')}
        description={
          overdue ? tn(overdue, '{n} debt is overdue', '{n} debts are overdue') : undefined
        }
        action={
          <Link to="/debts" className="text-sm font-medium text-primary hover:underline">
            {t('All')}
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 px-5 pb-5">
        <div>
          <p className="text-xs text-muted-foreground">{t('Owed to me')}</p>
          <p className="tabular text-lg font-semibold text-income">
            {money(sum('lent'), user.baseCurrency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('I owe')}</p>
          <p className="tabular text-lg font-semibold text-expense">
            {money(sum('borrowed'), user.baseCurrency)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Imported transactions waiting for review (the phone layout has no inbox tab). */
function InboxBanner() {
  const { pending } = useInboxBadge();
  if (!pending) return null;
  return (
    <Link
      to="/inbox"
      className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
    >
      <Inbox className="size-5 shrink-0" />
      <span className="flex-1">
        {tn(pending, '{n} imported transaction to review', '{n} imported transactions to review')}
      </span>
      <ArrowRight className="size-4" />
    </Link>
  );
}

/** In the first days of a month: the review of the month before is ready. */
function ReviewBanner() {
  const now = new Date();
  if (now.getDate() > 7) return null;
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return (
    <Link
      to="/review"
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
    >
      <ClipboardList className="size-5 shrink-0 text-primary" />
      <span className="flex-1">
        {t('Your review of {month} is ready', { month: fmt(last, 'LLLL') })}
      </span>
      <ArrowRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

export default function DashboardPage() {
  const user = useUser();
  const { openNew } = useRecordEditor();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: budgets } = useBudgets();
  const { data: goals } = useGoals();
  const lookups = useRecordLookups();
  const recent = useRecords({}, 8);

  const now = new Date();
  const monthStart = startOfMonth(now);
  // Compare the month so far with the same days of last month.
  const month = {
    from: monthStart.toISOString(),
    to: addMonths(monthStart, 1).toISOString(),
    compareFrom: addMonths(monthStart, -1).toISOString(),
    compareTo: addMonths(startOfHour(now), -1).toISOString(),
  };
  const last30 = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return { from: subDays(today, 29).toISOString(), to: subDays(today, -1).toISOString() };
  }, []);
  const last6m = useMemo(() => {
    const from = addMonths(startOfMonth(new Date()), -5);
    return { from: from.toISOString(), to: addMonths(startOfMonth(new Date()), 1).toISOString() };
  }, []);

  const visibleAccounts = (accounts ?? []).filter((a) => !a.archived);
  const netWorth = useMemo(() => {
    if (!accounts || !currencies) return null;
    const rates: Record<string, number> = { [currencies.baseCurrency]: 1 };
    for (const r of currencies.rates) rates[r.currency] = r.rate;
    return accounts
      .filter((a) => !a.archived && !a.excludeFromStats)
      .reduce((sum, a) => sum + convertMinor(a.balance, a.currency, user.baseCurrency, rates), 0);
  }, [accounts, currencies, user.baseCurrency]);

  const records = recent.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{fmt(now, 'EEEE, d MMMM yyyy')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user.name.split(' ')[0]}
          </h1>
        </div>
        <Button onClick={() => openNew()} className="hidden sm:inline-flex">
          <Plus /> {t('Add record')}
        </Button>
      </div>

      <GettingStarted />
      <InboxBanner />
      <ReviewBanner />

      {/* Accounts */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">{t('Accounts')}</h2>
            {netWorth !== null && (
              <p className="text-xs text-muted-foreground">
                {t('Total balance')}{' '}
                <span className="tabular font-semibold text-foreground">
                  {money(netWorth, user.baseCurrency)}
                </span>
              </p>
            )}
          </div>
          <Link
            to="/accounts"
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t('Manage')} <ArrowRight className="size-4" />
          </Link>
        </div>
        {accountsLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[108px] rounded-2xl" />
            ))}
          </div>
        ) : visibleAccounts.length === 0 ? (
          <Card>
            <EmptyState
              title={t('Create your first account')}
              description={t(
                'Accounts hold your money – for example Cash, a bank account or a savings account.',
              )}
              action={
                <Button asChild>
                  <Link to="/accounts?new=1">
                    <Plus /> {t('Add account')}
                  </Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {visibleAccounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">{t('This month')}</h2>
        <KpiTiles scope={month} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-2">
          <CategoryBreakdown
            scope={month}
            type="expense"
            title={t('Spending this month')}
            recordsLink={(id) => `/records?period=month${id ? `&categories=${id}` : ''}`}
          />
          <Card>
            <CardHeader title={t('Balance trend')} description={t('All accounts · last 30 days')} />
            <div className="px-3 pb-4">
              <BalanceChart scope={last30} interval="day" height={220} />
            </div>
          </Card>
          <Card>
            <CardHeader
              title={t('Cash flow')}
              description={t('Income vs expenses · last 6 months')}
            />
            <div className="px-3 pb-4">
              <CashflowChart scope={last6m} interval="month" height={240} />
            </div>
          </Card>
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <MonthEndForecast />
          <Card>
            <CardHeader
              title={t('Upcoming payments')}
              description={t('Overdue and due in the next 14 days')}
              action={
                <Link to="/planned" className="text-sm font-medium text-primary hover:underline">
                  {t('All')}
                </Link>
              }
            />
            <UpcomingList days={14} limit={6} />
          </Card>

          {budgets && budgets.length > 0 && (
            <Card>
              <CardHeader
                title={t('Budgets')}
                action={
                  <Link to="/budgets" className="text-sm font-medium text-primary hover:underline">
                    {t('All')}
                  </Link>
                }
              />
              <ul className="grid gap-4 px-5 pb-5">
                {budgets.slice(0, 5).map((b) => (
                  <li key={b.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{b.name}</span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        <span
                          className={
                            b.ratio > 1
                              ? 'font-semibold text-expense'
                              : 'font-semibold text-foreground'
                          }
                        >
                          {money(b.spent, b.currency)}
                        </span>{' '}
                        / {money(b.amount, b.currency)}
                      </span>
                    </div>
                    <ProgressBar
                      value={b.ratio}
                      color={
                        b.ratio > 1
                          ? 'var(--expense)'
                          : b.ratio > b.elapsed + 0.1
                            ? 'var(--warning)'
                            : b.color
                      }
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {b.ratio > 1
                        ? t('Over by {amount}', { amount: money(-b.remaining, b.currency) })
                        : t('{amount} left · {percent} used', {
                            amount: money(b.remaining, b.currency),
                            percent: percent(b.ratio),
                          })}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {goals && goals.length > 0 && (
            <Card>
              <CardHeader
                title={t('Savings goals')}
                action={
                  <Link to="/goals" className="text-sm font-medium text-primary hover:underline">
                    {t('All')}
                  </Link>
                }
              />
              <ul className="grid gap-4 px-5 pb-5">
                {goals.slice(0, 3).map((g) => (
                  <li key={g.id} className="flex items-center gap-3">
                    <IconBadge icon={g.icon} color={g.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{g.name}</span>
                        <span className="tabular shrink-0 text-xs text-muted-foreground">
                          {percent(Math.min(1, g.progress))}
                        </span>
                      </div>
                      <ProgressBar value={g.progress} color={g.color} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <DebtsSummary />

          <Card>
            <CardHeader
              title={t('Recent records')}
              action={
                <Link to="/records" className="text-sm font-medium text-primary hover:underline">
                  {t('All')}
                </Link>
              }
            />
            <div className="px-1 pb-2">
              {recent.isLoading ? (
                <div className="grid gap-2 p-3">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : records.length === 0 ? (
                <EmptyState
                  title={t('No records yet')}
                  description={t('Press “Add record” to log your first expense.')}
                  className="py-8"
                />
              ) : (
                records.map((r) => <RecordRow key={r.id} record={r} lookups={lookups} showDate />)
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
