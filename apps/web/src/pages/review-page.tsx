import {
  isMonth,
  type MonthlyReview,
  nextMonth,
  previousMonth,
  type ReviewCategory,
} from '@dostotinka/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ClipboardList, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '@/api/client';
import { useCategories } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  Skeleton,
} from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { buildCategoryIndex, type CategoryIndex } from '@/lib/categories';
import { fmtCap } from '@/lib/date';
import { money, percent, shortDate } from '@/lib/format';
import { browserTimeZone, cn } from '@/lib/utils';

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (month: string) =>
  fmtCap(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1), 'LLLL yyyy');

export function useMonthlyReview(month: string) {
  return useQuery({
    queryKey: ['stats', 'review', month],
    queryFn: () =>
      api<MonthlyReview>(
        `/stats/review?month=${month}&tz=${encodeURIComponent(browserTimeZone())}`,
      ),
  });
}

export default function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('month');
  const current = thisMonth();
  const month =
    requested && isMonth(requested) && requested <= current ? requested : previousMonth(current);
  const { data: review, isLoading } = useMonthlyReview(month);
  const { data: categoryList } = useCategories();
  const categories = useMemo(() => buildCategoryIndex(categoryList), [categoryList]);
  const go = (m: string) => setParams({ month: m }, { replace: true });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('Monthly review')}
        description={t('What happened with your money – compared with the months before.')}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('Previous month')}
              disabled={!!review?.firstMonth && month <= review.firstMonth}
              onClick={() => go(previousMonth(month))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(month)}</span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('Next month')}
              disabled={month >= current}
              onClick={() => go(nextMonth(month))}
            >
              <ChevronRight />
            </Button>
          </div>
        }
      />
      {isLoading || !review ? (
        <div className="grid gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      ) : review.recordCount === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title={t('Nothing recorded in {month}', { month: monthLabel(month) })}
            description={t('The review appears once the month has records.')}
          />
        </Card>
      ) : (
        <ReviewContent review={review} categories={categories} />
      )}
    </div>
  );
}

function Change({
  amount,
  typical,
  currency,
  invert,
}: {
  amount: number;
  typical: number;
  currency: string;
  invert?: boolean;
}) {
  if (!typical) return null;
  const diff = amount - typical;
  if (Math.abs(diff) < typical * 0.02) {
    return <span className="text-xs text-muted-foreground">{t('as usual')}</span>;
  }
  const up = diff > 0;
  const good = invert ? up : !up;
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-1 text-xs font-medium',
        good ? 'text-income' : 'text-expense',
      )}
    >
      {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {money(Math.abs(diff), currency)} {up ? t('more than usual') : t('less than usual')}
    </span>
  );
}

function ReviewContent({
  review,
  categories,
}: {
  review: MonthlyReview;
  categories: CategoryIndex;
}) {
  const c = review.currency;
  const name = (id: string | null) => (id ? categories.nameOf(id) : t('Uncategorised'));
  const maxCategory = review.categories[0]?.amount ?? 1;
  return (
    <div className="grid grid-cols-1 gap-5">
      {review.partial && (
        <p className="rounded-xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          {t('This month is not over yet – the numbers show it so far.')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t('Income')}>
          <p className="tabular text-xl font-semibold text-income">{money(review.income, c)}</p>
          {review.typical.months > 0 && (
            <Change amount={review.income} typical={review.typical.income} currency={c} invert />
          )}
        </Tile>
        <Tile label={t('Expenses')}>
          <p className="tabular text-xl font-semibold text-expense">{money(review.expense, c)}</p>
          {review.typical.months > 0 && (
            <Change amount={review.expense} typical={review.typical.expense} currency={c} />
          )}
        </Tile>
        <Tile label={t('Left over')}>
          <p className={cn('tabular text-xl font-semibold', review.net < 0 && 'text-expense')}>
            {money(review.net, c, { sign: 'exceptZero' })}
          </p>
          {review.savingsRate !== null && (
            <span className="text-xs text-muted-foreground">
              {t('{rate} of the income', { rate: percent(review.savingsRate) })}
            </span>
          )}
        </Tile>
        <Tile label={t('Balance')}>
          <p className="tabular text-xl font-semibold">{money(review.balanceEnd, c)}</p>
          <span className="text-xs text-muted-foreground">
            {money(review.balanceEnd - review.balanceStart, c, { sign: 'exceptZero' })}{' '}
            {t('in this month')}
          </span>
        </Tile>
      </div>

      {review.typical.months > 0 && review.changes.length > 0 && (
        <Card>
          <CardHeader
            title={t('What was different')}
            description={tn(
              review.typical.months,
              'Compared with the month before.',
              'Compared with the average of the {n} months before.',
            )}
          />
          <ul className="divide-y divide-border px-5 pb-3">
            {review.changes.map((ch) => (
              <CategoryRow
                key={ch.categoryId ?? 'none'}
                item={ch}
                name={name(ch.categoryId)}
                categories={categories}
                currency={c}
              >
                <Change amount={ch.amount} typical={ch.typical} currency={c} />
              </CategoryRow>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('Where the money went')} />
          <ul className="grid gap-3 px-5 pb-5">
            {review.categories.slice(0, 8).map((cat) => (
              <li key={cat.categoryId ?? 'none'}>
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <IconBadge
                    icon={cat.categoryId ? categories.iconOf(cat.categoryId) : 'circle-help'}
                    color={cat.categoryId ? categories.colorOf(cat.categoryId) : '#64748B'}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1 truncate">{name(cat.categoryId)}</span>
                  <span className="tabular font-medium">{money(cat.amount, c)}</span>
                </div>
                <ProgressBar
                  value={cat.amount / maxCategory}
                  color={cat.categoryId ? categories.colorOf(cat.categoryId) : '#64748B'}
                />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title={t('Top payees')}
            description={t('Payee, or the note of records without one.')}
          />
          {review.payees.length ? (
            <ul className="divide-y divide-border px-5 pb-3">
              {review.payees.map((p) => (
                <li key={p.name} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {tn(p.count, '{n} time', '{n} times')}
                  </span>
                  <span className="tabular font-medium">{money(p.amount, c)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              {t('No payees or notes this month.')}
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t('Largest payments')} />
        <ul className="divide-y divide-border px-5 pb-3">
          {review.largest.map((r) => (
            <li key={r.recordId} className="flex items-center gap-3 py-2.5 text-sm">
              <IconBadge
                icon={r.categoryId ? categories.iconOf(r.categoryId) : 'circle-help'}
                color={r.categoryId ? categories.colorOf(r.categoryId) : '#64748B'}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {r.payee || r.note || name(r.categoryId)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shortDate(r.occurredAt)} ·{' '}
                  {categories.pathOf(r.categoryId) || t('Uncategorised')}
                </span>
              </span>
              {r.unusual && <Badge tone="warning">{t('unusual')}</Badge>}
              <span className="tabular font-medium text-expense">{money(r.amount, c)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {review.budgets.length > 0 && (
        <Card>
          <CardHeader
            title={t('Budgets')}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/budgets">{t('All budgets')}</Link>
              </Button>
            }
          />
          <ul className="grid gap-4 px-5 pb-5">
            {review.budgets.map((b) => {
              const ratio = b.amount ? b.spent / b.amount : 0;
              return (
                <li key={b.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{b.name}</span>
                    <span className={cn('tabular', ratio > 1 && 'font-medium text-expense')}>
                      {money(b.spent, b.currency)} / {money(b.amount, b.currency)}
                    </span>
                  </div>
                  <ProgressBar
                    value={Math.min(1, ratio)}
                    color={ratio > 1 ? 'var(--expense)' : undefined}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ratio > 1
                      ? t('{amount} over the limit', {
                          amount: money(b.spent - b.amount, b.currency),
                        })
                      : t('{amount} left', { amount: money(b.amount - b.spent, b.currency) })}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="grid min-w-0 content-start gap-1 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </Card>
  );
}

function CategoryRow({
  item,
  name,
  categories,
  currency,
  children,
}: {
  item: ReviewCategory;
  name: string;
  categories: CategoryIndex;
  currency: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <IconBadge
        icon={item.categoryId ? categories.iconOf(item.categoryId) : 'circle-help'}
        color={item.categoryId ? categories.colorOf(item.categoryId) : '#64748B'}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {children}
      </span>
      <span className="text-right">
        <span className="tabular block text-sm font-medium">{money(item.amount, currency)}</span>
        <span className="tabular block text-xs text-muted-foreground">
          {t('usually {amount}', { amount: money(item.typical, currency) })}
        </span>
      </span>
    </li>
  );
}
