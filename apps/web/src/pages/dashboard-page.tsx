import { convertMinor } from '@slavotax/shared';
import { addMonths, format, startOfMonth, subDays } from 'date-fns';
import { ArrowRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  useAccounts,
  useBudgets,
  useCurrencies,
  useGoals,
  useRecords,
  useUser,
} from '@/api/queries';
import { AccountCard } from '@/components/accounts/account-card';
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
import { money, percent } from '@/lib/format';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
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
  const month = { from: monthStart.toISOString(), to: addMonths(monthStart, 1).toISOString() };
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
          <p className="text-sm text-muted-foreground">{format(now, 'EEEE, d MMMM yyyy')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user.name.split(' ')[0]}
          </h1>
        </div>
        <Button onClick={() => openNew()} className="hidden sm:inline-flex">
          <Plus /> Add record
        </Button>
      </div>

      {/* Accounts */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Accounts</h2>
            {netWorth !== null && (
              <p className="text-xs text-muted-foreground">
                Total balance{' '}
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
            Manage <ArrowRight className="size-4" />
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
              title="Create your first account"
              description="Accounts hold your money – for example Cash, a bank account or a savings account."
              action={
                <Button asChild>
                  <Link to="/accounts?new=1">
                    <Plus /> Add account
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
        <h2 className="mb-3 text-sm font-semibold">This month</h2>
        <KpiTiles scope={month} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-2">
          <CategoryBreakdown
            scope={month}
            type="expense"
            title="Spending this month"
            recordsLink={(id) => `/records?period=month${id ? `&categories=${id}` : ''}`}
          />
          <Card>
            <CardHeader title="Balance trend" description="All accounts · last 30 days" />
            <div className="px-3 pb-4">
              <BalanceChart scope={last30} interval="day" height={220} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Cash flow" description="Income vs expenses · last 6 months" />
            <div className="px-3 pb-4">
              <CashflowChart scope={last6m} interval="month" height={240} />
            </div>
          </Card>
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <Card>
            <CardHeader
              title="Upcoming payments"
              description="Overdue and due in the next 14 days"
              action={
                <Link to="/planned" className="text-sm font-medium text-primary hover:underline">
                  All
                </Link>
              }
            />
            <UpcomingList days={14} limit={6} />
          </Card>

          {budgets && budgets.length > 0 && (
            <Card>
              <CardHeader
                title="Budgets"
                action={
                  <Link to="/budgets" className="text-sm font-medium text-primary hover:underline">
                    All
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
                        ? `Over by ${money(-b.remaining, b.currency)}`
                        : `${money(b.remaining, b.currency)} left · ${percent(b.ratio)} used`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {goals && goals.length > 0 && (
            <Card>
              <CardHeader
                title="Savings goals"
                action={
                  <Link to="/goals" className="text-sm font-medium text-primary hover:underline">
                    All
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

          <Card>
            <CardHeader
              title="Recent records"
              action={
                <Link to="/records" className="text-sm font-medium text-primary hover:underline">
                  All
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
                  title="No records yet"
                  description="Press “Add record” to log your first expense."
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
