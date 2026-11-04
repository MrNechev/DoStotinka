import type { Interval, TimeseriesResponse } from '@slavotax/shared';
import { ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { type StatsScope, useCategories, useTimeseries } from '@/api/queries';
import { IconBadge } from '@/components/ui/category-icon';
import { Skeleton } from '@/components/ui/misc';
import { t } from '@/i18n';
import { buildCategoryIndex, type CategoryIndex } from '@/lib/categories';
import { money } from '@/lib/format';
import { bucketLabel } from '@/lib/period';
import { cn } from '@/lib/utils';

interface Row {
  id: string;
  values: number[];
  total: number;
}

function rowsOf(data: TimeseriesResponse | undefined): Row[] {
  if (!data) return [];
  const map = new Map<string, number[]>();
  data.points.forEach((p, i) => {
    for (const [id, v] of Object.entries(p.byCategory)) {
      const arr = map.get(id) ?? new Array(data.points.length).fill(0);
      arr[i] += v;
      map.set(id, arr);
    }
  });
  return [...map.entries()]
    .map(([id, values]) => ({ id, values, total: values.reduce((a, b) => a + b, 0) }))
    .filter((r) => r.total !== 0)
    .sort((a, b) => b.total - a.total);
}

/** Heat tint for a cell – one hue, stronger for larger values (sequential encoding). */
function cellStyle(value: number, max: number, tone: 'expense' | 'income') {
  if (!value || !max) return undefined;
  const pct = Math.round(4 + 26 * Math.sqrt(Math.min(1, value / max)));
  return { backgroundColor: `color-mix(in srgb, var(--${tone}) ${pct}%, transparent)` };
}

function SubRows({
  scope,
  interval,
  type,
  parentId,
  index,
  columns,
  max,
}: {
  scope: StatsScope;
  interval: Interval;
  type: 'expense' | 'income';
  parentId: string;
  index: CategoryIndex;
  columns: number;
  max: number;
}) {
  const { data, isLoading } = useTimeseries(scope, interval, type, parentId);
  const rows = rowsOf(data);
  const currency = data?.currency ?? 'EUR';
  if (isLoading) {
    return (
      <tr>
        <td colSpan={columns + 3} className="px-3 py-2">
          <Skeleton className="h-5" />
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <tr key={r.id} className="bg-muted/30 text-xs">
          <td className="sticky left-0 z-10 bg-card py-1.5 pl-12 pr-3">
            <span className="block max-w-44 truncate text-muted-foreground">
              {r.id === parentId ? `${index.nameOf(r.id)} (general)` : index.nameOf(r.id)}
            </span>
          </td>
          {r.values.map((v, i) => (
            <td key={i} className="tabular px-3 py-1.5 text-right" style={cellStyle(v, max, type)}>
              {v ? money(v, currency) : <span className="text-muted-foreground/40">–</span>}
            </td>
          ))}
          <td className="tabular px-3 py-1.5 text-right font-medium">{money(r.total, currency)}</td>
          <td className="tabular px-3 py-1.5 text-right text-muted-foreground">
            {money(Math.round(r.total / Math.max(1, columns)), currency)}
          </td>
        </tr>
      ))}
    </>
  );
}

function Section({
  scope,
  interval,
  type,
  index,
  data,
}: {
  scope: StatsScope;
  interval: Interval;
  type: 'expense' | 'income';
  index: CategoryIndex;
  data: TimeseriesResponse | undefined;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = rowsOf(data);
  const currency = data?.currency ?? 'EUR';
  const columns = data?.points.length ?? 0;
  const max = Math.max(0, ...rows.flatMap((r) => r.values));
  const totals = (data?.points ?? []).map((p) => p.total);
  const grand = totals.reduce((a, b) => a + b, 0);
  const label = type === 'expense' ? t('Expenses') : t('Income');

  return (
    <>
      <tr className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <td className="sticky left-0 z-10 bg-muted px-3 py-2">{label}</td>
        <td colSpan={columns + 2} />
      </tr>
      {rows.length === 0 && (
        <tr>
          <td colSpan={columns + 3} className="px-3 py-3 text-sm text-muted-foreground">
            No {label.toLowerCase()} in this period.
          </td>
        </tr>
      )}
      {rows.map((r) => {
        const expandable = r.id !== 'uncategorized' && index.childrenOf(r.id).length > 0;
        const isOpen = open.has(r.id);
        return (
          <Fragment key={r.id}>
            <tr className="border-t border-border">
              <td className="sticky left-0 z-10 bg-card px-3 py-2">
                <button
                  type="button"
                  disabled={!expandable}
                  onClick={() => {
                    const next = new Set(open);
                    if (isOpen) next.delete(r.id);
                    else next.add(r.id);
                    setOpen(next);
                  }}
                  className="flex max-w-56 items-center gap-2 text-left text-sm disabled:cursor-default"
                >
                  <ChevronRight
                    className={cn(
                      'size-3.5 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-90',
                      !expandable && 'invisible',
                    )}
                  />
                  <IconBadge
                    icon={r.id === 'uncategorized' ? 'circle-help' : index.iconOf(r.id)}
                    color={index.colorOf(r.id === 'uncategorized' ? null : r.id)}
                    size="xs"
                  />
                  <span className="truncate font-medium">
                    {r.id === 'uncategorized' ? t('Uncategorized') : index.nameOf(r.id)}
                  </span>
                </button>
              </td>
              {r.values.map((v, i) => (
                <td
                  key={i}
                  className="tabular px-3 py-2 text-right text-sm"
                  style={cellStyle(v, max, type)}
                >
                  {v ? money(v, currency) : <span className="text-muted-foreground/40">–</span>}
                </td>
              ))}
              <td className="tabular px-3 py-2 text-right text-sm font-semibold">
                {money(r.total, currency)}
              </td>
              <td className="tabular px-3 py-2 text-right text-sm text-muted-foreground">
                {money(Math.round(r.total / Math.max(1, columns)), currency)}
              </td>
            </tr>
            {isOpen && (
              <SubRows
                scope={scope}
                interval={interval}
                type={type}
                parentId={r.id}
                index={index}
                columns={columns}
                max={max}
              />
            )}
          </Fragment>
        );
      })}
      <tr className="border-t-2 border-border font-semibold">
        <td className="sticky left-0 z-10 bg-card px-3 py-2 text-sm">
          Total {label.toLowerCase()}
        </td>
        {totals.map((v, i) => (
          <td
            key={i}
            className={cn(
              'tabular px-3 py-2 text-right text-sm',
              type === 'expense' ? 'text-expense' : 'text-income',
            )}
          >
            {money(v, currency)}
          </td>
        ))}
        <td
          className={cn(
            'tabular px-3 py-2 text-right text-sm',
            type === 'expense' ? 'text-expense' : 'text-income',
          )}
        >
          {money(grand, currency)}
        </td>
        <td className="tabular px-3 py-2 text-right text-sm text-muted-foreground">
          {money(Math.round(grand / Math.max(1, columns)), currency)}
        </td>
      </tr>
    </>
  );
}

/** Categories × periods table with totals, averages and expandable subcategories. */
export function CategoryReport({ scope, interval }: { scope: StatsScope; interval: Interval }) {
  const { data: categories } = useCategories();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const expenses = useTimeseries(scope, interval, 'expense');
  const income = useTimeseries(scope, interval, 'income');

  if (expenses.isLoading || income.isLoading) return <Skeleton className="m-5 h-64" />;
  const points = expenses.data?.points ?? [];
  const currency = expenses.data?.currency ?? 'EUR';
  const net = points.map((p, i) => (income.data?.points[i]?.total ?? 0) - p.total);
  const netTotal = net.reduce((a, b) => a + b, 0);

  return (
    <div
      className={cn(
        'overflow-x-auto transition-opacity',
        (expenses.isFetching || income.isFetching) && 'opacity-60',
      )}
    >
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
              {t('Category')}
            </th>
            {points.map((p) => (
              <th key={p.date} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {bucketLabel(p.date, interval)}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">{t('Total')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('Average')}</th>
          </tr>
        </thead>
        <tbody>
          <Section
            scope={scope}
            interval={interval}
            type="income"
            index={index}
            data={income.data}
          />
          <Section
            scope={scope}
            interval={interval}
            type="expense"
            index={index}
            data={expenses.data}
          />
          <tr className="border-t-2 border-border bg-muted/40 font-semibold">
            <td className="sticky left-0 z-10 bg-muted px-3 py-2.5 text-sm">{t('Cash flow')}</td>
            {net.map((v, i) => (
              <td
                key={i}
                className={cn('tabular px-3 py-2.5 text-right text-sm', v < 0 && 'text-expense')}
              >
                {money(v, currency, { sign: 'exceptZero' })}
              </td>
            ))}
            <td
              className={cn(
                'tabular px-3 py-2.5 text-right text-sm',
                netTotal < 0 && 'text-expense',
              )}
            >
              {money(netTotal, currency, { sign: 'exceptZero' })}
            </td>
            <td className="tabular px-3 py-2.5 text-right text-sm text-muted-foreground">
              {money(Math.round(netTotal / Math.max(1, net.length)), currency, {
                sign: 'exceptZero',
              })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
