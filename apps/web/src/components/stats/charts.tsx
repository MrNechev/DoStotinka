import type { Interval } from '@slavotax/shared';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, ChartColumn } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type StatsScope,
  useBalanceTrend,
  useCashflow,
  useCategories,
  useCategoryStats,
  useStatsSummary,
  useTimeseries,
} from '@/api/queries';
import { IconBadge } from '@/components/ui/category-icon';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { buildCategoryIndex, shades, UNCATEGORIZED_COLOR } from '@/lib/categories';
import { changeRatio, money, moneyAxis, percent, plural } from '@/lib/format';
import { bucketLabel } from '@/lib/period';
import { cn } from '@/lib/utils';

const OTHER_COLOR = '#A3ADB9';
const MAX_SERIES = 8;

// ───────────────────────────── Shared bits ─────────────────────────────

interface TooltipRow {
  key: string;
  label: string;
  value: string;
  color: string;
}

function TooltipBox({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-44 max-w-72 rounded-xl border border-border bg-popover px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-muted-foreground">{title}</p>
      <div className="grid gap-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <span className="tabular font-semibold text-foreground">{r.value}</span>
            <span className="min-w-0 truncate text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 border-t border-border pt-1.5">{footer}</div>}
    </div>
  );
}

function LegendItem({
  color,
  label,
  shape = 'rect',
}: {
  color: string;
  label: string;
  shape?: 'rect' | 'line';
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={shape === 'rect' ? 'size-2.5 rounded-[3px]' : 'h-0.5 w-3.5 rounded-full'}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

/** Rect with a 4px rounded data-end (top) and a square baseline. */
function roundedTopPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function makeShape(dataKey: string, topKeyField = '__top') {
  return (props: unknown) => {
    const p = props as {
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      payload: Record<string, unknown>;
    };
    const isTop = p.payload?.[topKeyField] === dataKey;
    const d = isTop
      ? roundedTopPath(p.x, p.y, p.width, p.height, 4)
      : p.height > 0
        ? `M${p.x},${p.y} h${p.width} v${p.height} h${-p.width} Z`
        : '';
    return <path d={d} fill={p.fill} stroke="var(--card)" strokeWidth={2} />;
  };
}

function ChartFrame({
  loading,
  children,
  height,
}: {
  loading: boolean;
  children: ReactNode;
  height: number;
}) {
  return (
    <div className={cn('transition-opacity', loading && 'opacity-60')} style={{ height }}>
      {children}
    </div>
  );
}

const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11 },
} as const;

// ───────────────────────────── KPI tiles ─────────────────────────────

function Delta({
  current,
  previous,
  upIsGood,
}: {
  current: number;
  previous: number;
  upIsGood: boolean;
}) {
  const ratio = changeRatio(current, previous);
  if (ratio === null || !Number.isFinite(ratio)) {
    return (
      <span className="text-xs text-muted-foreground">{t('No data for the previous period')}</span>
    );
  }
  const up = ratio >= 0;
  const good = up === upIsGood;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        good ? 'text-income' : 'text-expense',
      )}
    >
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {percent(Math.abs(ratio))}
      <span className="ml-1 hidden font-normal text-muted-foreground sm:inline">
        {t('vs previous period')}
      </span>
    </span>
  );
}

export function KpiTiles({ scope, className }: { scope: StatsScope; className?: string }) {
  const { data, isLoading } = useStatsSummary(scope);
  const tiles = data
    ? [
        {
          label: t('Income'),
          value: money(data.income, data.currency),
          tone: 'text-income',
          delta: <Delta current={data.income} previous={data.previous.income} upIsGood />,
        },
        {
          label: t('Expenses'),
          value: money(data.expense, data.currency),
          tone: 'text-expense',
          delta: <Delta current={data.expense} previous={data.previous.expense} upIsGood={false} />,
        },
        {
          label: t('Cash flow'),
          value: money(data.net, data.currency, { sign: 'exceptZero' }),
          tone: data.net >= 0 ? 'text-foreground' : 'text-expense',
          delta: (
            <span className="text-xs text-muted-foreground">
              {t('Previous: {amount}', {
                amount: money(data.previous.net, data.currency, { sign: 'exceptZero' }),
              })}
            </span>
          ),
        },
        {
          label: t('Average spending per day'),
          value: money(data.avgDailyExpense, data.currency),
          tone: 'text-foreground',
          delta: (
            <span className="text-xs text-muted-foreground">
              {plural(data.expenseCount, 'expense')} ·{' '}
              {plural(data.incomeCount, 'income', 'incomes')}
            </span>
          ),
        },
      ]
    : [];
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {isLoading || !data
        ? Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))
        : tiles.map((tile) => (
            <Card key={tile.label} className="px-4 py-3.5">
              <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
              <p
                className={cn('tabular mt-1 truncate text-xl font-semibold sm:text-2xl', tile.tone)}
              >
                {tile.value}
              </p>
              <div className="mt-1 truncate">{tile.delta}</div>
            </Card>
          ))}
    </div>
  );
}

// ───────────────────────────── Category breakdown ─────────────────────────────

interface Slice {
  id: string;
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  amount: number;
  previousAmount: number;
  count: number;
  hasChildren: boolean;
}

export function CategoryBreakdown({
  scope,
  type,
  title,
  description,
  recordsLink,
  compact,
}: {
  scope: StatsScope;
  type: 'expense' | 'income';
  title?: string;
  description?: string;
  /** Builds a link to the records page for a category. */
  recordsLink?: (categoryId: string | null) => string;
  compact?: boolean;
}) {
  const [parentId, setParentId] = useState<string | null>(null);
  const { data: categories } = useCategories();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const { data, isLoading, isFetching } = useCategoryStats(scope, type, parentId);
  const [active, setActive] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const slices: Slice[] = useMemo(() => {
    if (!data) return [];
    const parent = parentId ? index.byId.get(parentId) : undefined;
    const childShades = parent
      ? shades(index.colorOf(parent.id), Math.max(2, data.items.length))
      : [];
    return data.items
      .filter((i) => i.amount > 0)
      .map((i, n) => {
        const c = i.categoryId ? index.byId.get(i.categoryId) : undefined;
        const isParentItself = parent && i.categoryId === parent.id;
        return {
          id: i.categoryId ?? 'uncategorized',
          categoryId: i.categoryId,
          name: isParentItself
            ? t('{name} (general)', { name: c?.name ?? '' })
            : (c?.name ?? t('Uncategorized')),
          icon: c?.icon ?? 'circle-help',
          color: parent
            ? (childShades[n] ?? OTHER_COLOR)
            : c
              ? index.colorOf(c.id)
              : UNCATEGORIZED_COLOR,
          amount: i.amount,
          previousAmount: i.previousAmount,
          count: i.count,
          hasChildren: !parent && !!c && index.childrenOf(c.id).length > 0,
        };
      });
  }, [data, index, parentId]);

  const total = slices.reduce((a, s) => a + s.amount, 0);
  const pieData = useMemo(() => {
    if (slices.length <= MAX_SERIES + 1) return slices;
    const head = slices.slice(0, MAX_SERIES);
    const rest = slices.slice(MAX_SERIES);
    return [
      ...head,
      {
        id: '__other',
        categoryId: null,
        name: t('Other ({n})', { n: rest.length }),
        icon: 'shapes',
        color: OTHER_COLOR,
        amount: rest.reduce((a, s) => a + s.amount, 0),
        previousAmount: 0,
        count: rest.reduce((a, s) => a + s.count, 0),
        hasChildren: false,
      },
    ];
  }, [slices]);

  const currency = data?.currency ?? 'EUR';
  const parent = parentId ? index.byId.get(parentId) : undefined;
  const activeSlice = active ? pieData.find((s) => s.id === active) : undefined;
  const onSliceClick = (s: Slice) => {
    if (s.hasChildren && s.categoryId) {
      setParentId(s.categoryId);
      setActive(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          parent ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setParentId(null)}
                className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('Back to all categories')}
              >
                <ArrowLeft className="size-4" />
              </button>
              {parent.name}
            </span>
          ) : (
            (title ?? (type === 'expense' ? t('Spending by category') : t('Income by category')))
          )
        }
        description={
          parent
            ? t('Subcategories')
            : (description ?? t('Click a category to see its subcategories'))
        }
      />
      {isLoading ? (
        <div className="p-5">
          <Skeleton className="mx-auto size-48 rounded-full" />
        </div>
      ) : slices.length === 0 ? (
        <EmptyState
          icon={<ChartColumn />}
          title={
            type === 'expense' ? t('No expenses in this period') : t('No income in this period')
          }
          className="py-10"
        />
      ) : (
        <div
          className={cn(
            'grid gap-4 px-5 pb-5 transition-opacity',
            !compact && 'md:grid-cols-[minmax(200px,260px)_1fr] md:items-start',
            isFetching && 'opacity-60',
          )}
        >
          <div className="relative mx-auto aspect-square w-full max-w-[240px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 400, height: 200 }}
            >
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius="66%"
                  outerRadius="100%"
                  paddingAngle={pieData.length > 1 ? 1.2 : 0}
                  stroke="var(--card)"
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={false}
                  onMouseLeave={() => setActive(null)}
                >
                  {pieData.map((s) => (
                    <Cell
                      key={s.id}
                      fill={s.color}
                      opacity={active && active !== s.id ? 0.35 : 1}
                      className={cn(s.hasChildren && 'cursor-pointer')}
                      onMouseEnter={() => setActive(s.id)}
                      onClick={() => onSliceClick(s)}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <span className="max-w-full truncate text-xs text-muted-foreground">
                {activeSlice
                  ? activeSlice.name
                  : type === 'expense'
                    ? t('Total spent')
                    : t('Total received')}
              </span>
              <span className="tabular text-lg font-semibold">
                {money(activeSlice ? activeSlice.amount : total, currency)}
              </span>
              {activeSlice && (
                <span className="text-xs text-muted-foreground">
                  {percent(activeSlice.amount / total, 1)}
                </span>
              )}
            </div>
          </div>
          <ul className="grid gap-0.5">
            {slices.slice(0, showAll ? undefined : compact ? 6 : 8).map((s) => {
              const ratio = changeRatio(s.amount, s.previousAmount);
              const content = (
                <>
                  <IconBadge icon={s.icon} color={s.color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {money(s.amount, currency)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${(s.amount / total) * 100}%`,
                            backgroundColor: s.color,
                          }}
                        />
                      </span>
                      <span className="tabular w-11 shrink-0 text-right text-xs text-muted-foreground">
                        {percent(s.amount / total, s.amount / total < 0.1 ? 1 : 0)}
                      </span>
                    </span>
                    {!compact && (
                      <span className="mt-0.5 flex justify-between text-[11px] text-muted-foreground">
                        <span>{tn(s.count, '{n} record', '{n} records')}</span>
                        {ratio !== null && Number.isFinite(ratio) && (
                          <span>
                            {t('{change} vs previous', {
                              change: `${ratio >= 0 ? '+' : '−'}${percent(Math.abs(ratio))}`,
                            })}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </>
              );
              const rowClass = cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted',
                active === s.id && 'bg-muted',
              );
              return (
                <li
                  key={s.id}
                  onMouseEnter={() => setActive(s.id)}
                  onMouseLeave={() => setActive(null)}
                >
                  {s.hasChildren ? (
                    <button
                      type="button"
                      className={cn(rowClass, 'cursor-pointer')}
                      onClick={() => onSliceClick(s)}
                    >
                      {content}
                    </button>
                  ) : recordsLink ? (
                    <Link to={recordsLink(s.categoryId)} className={rowClass}>
                      {content}
                    </Link>
                  ) : (
                    <div className={rowClass}>{content}</div>
                  )}
                </li>
              );
            })}
            {slices.length > (compact ? 6 : 8) && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                >
                  {showAll ? t('Show less') : t('Show all {n} categories', { n: slices.length })}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────────── Spending over time ─────────────────────────────

export function CategoryTimeChart({
  scope,
  interval,
  type,
  categoryId,
  height = 300,
  onSegmentClick,
}: {
  scope: StatsScope;
  interval: Interval;
  type: 'expense' | 'income';
  categoryId?: string | null;
  height?: number;
  /** Called with the bucket start date and the category (null for "Other"/uncategorized). */
  onSegmentClick?: (date: string, categoryId: string | null) => void;
}) {
  const { data, isLoading, isFetching } = useTimeseries(scope, interval, type, categoryId);
  const { data: categories } = useCategories();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);

  const { rows, series } = useMemo(() => {
    if (!data) return { rows: [], series: [] as { key: string; name: string; color: string }[] };
    const totals = new Map<string, number>();
    for (const p of data.points) {
      for (const [k, v] of Object.entries(p.byCategory)) totals.set(k, (totals.get(k) ?? 0) + v);
    }
    const ranked = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const head = ranked
      .slice(0, ranked.length > MAX_SERIES + 1 ? MAX_SERIES : ranked.length)
      .map(([k]) => k);
    const hasOther = ranked.length > head.length;
    const filteredParent = categoryId ? index.byId.get(categoryId) : undefined;
    const subShades =
      filteredParent && !filteredParent.parentId
        ? shades(index.colorOf(filteredParent.id), Math.max(2, head.length))
        : [];
    // Colour follows the entity: keep the category's own colour (shades only inside one group).
    const s = head.map((k, i) => ({
      key: k,
      name: k === 'uncategorized' ? t('Uncategorized') : index.nameOf(k),
      color:
        k === 'uncategorized'
          ? UNCATEGORIZED_COLOR
          : subShades.length
            ? subShades[i]!
            : index.colorOf(k),
    }));
    if (hasOther) s.push({ key: '__other', name: t('Other'), color: OTHER_COLOR });
    const order = s.map((x) => x.key);
    const r = data.points.map((p) => {
      const row: Record<string, number | string> = { date: p.date, total: p.total };
      let other = 0;
      for (const [k, v] of Object.entries(p.byCategory)) {
        if (head.includes(k)) row[k] = v;
        else other += v;
      }
      if (hasOther) row.__other = other;
      // The top-most non-empty segment gets the rounded data-end.
      for (let i = order.length - 1; i >= 0; i--) {
        if (Number(row[order[i]!] ?? 0) > 0) {
          row.__top = order[i]!;
          break;
        }
      }
      return row;
    });
    return { rows: r, series: s };
  }, [data, index, categoryId]);

  const currency = data?.currency ?? 'EUR';
  const total = rows.reduce((a, r) => a + Number(r.total ?? 0), 0);

  if (isLoading) return <Skeleton className="w-full rounded-xl" style={{ height }} />;
  if (!total) {
    return (
      <EmptyState
        icon={<ChartColumn />}
        title={type === 'expense' ? t('No spending in this period') : t('No income in this period')}
        className="py-10"
      />
    );
  }

  return (
    <div>
      <ChartFrame loading={isFetching} height={height}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 400, height: 200 }}
        >
          <BarChart
            data={rows}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid vertical={false} strokeWidth={1} />
            <XAxis
              dataKey="date"
              {...axisProps}
              tickFormatter={(d: string) => bucketLabel(d, interval)}
              minTickGap={16}
              interval="preserveStartEnd"
            />
            <YAxis
              {...axisProps}
              width={60}
              tickFormatter={(v: number) => moneyAxis(v, currency)}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]!.payload as Record<string, number>;
                const items = series
                  .map((s) => ({ ...s, v: Number(row[s.key] ?? 0) }))
                  .filter((s) => s.v > 0)
                  .sort((a, b) => b.v - a.v);
                return (
                  <TooltipBox
                    title={bucketLabel(String(label), interval, true)}
                    rows={items.map((s) => ({
                      key: s.key,
                      label: s.name,
                      value: money(s.v, currency),
                      color: s.color,
                    }))}
                    footer={
                      <span className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{t('Total')}</span>
                        <span className="tabular font-semibold">
                          {money(Number(row.total ?? 0), currency)}
                        </span>
                      </span>
                    }
                  />
                );
              }}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stackId="a"
                fill={s.color}
                maxBarSize={24}
                isAnimationActive={false}
                shape={makeShape(s.key)}
                className={onSegmentClick ? 'cursor-pointer' : undefined}
                onClick={
                  onSegmentClick
                    ? (entry: unknown) => {
                        const row = (entry as { payload?: { date?: string } }).payload;
                        if (!row?.date) return;
                        const cat = s.key === '__other' || s.key === 'uncategorized' ? null : s.key;
                        onSegmentClick(row.date, cat ?? categoryId ?? null);
                      }
                    : undefined
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <LegendItem key={s.key} color={s.color} label={s.name} />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── Cash flow ─────────────────────────────

export function CashflowChart({
  scope,
  interval,
  height = 280,
}: {
  scope: StatsScope;
  interval: Interval;
  height?: number;
}) {
  const { data, isLoading, isFetching } = useCashflow(scope, interval);
  const rows = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({ ...p, __topIncome: 'income', __topExpense: 'expense' })),
    [data],
  );
  if (isLoading) return <Skeleton className="w-full rounded-xl" style={{ height }} />;
  const currency = data?.currency ?? 'EUR';
  const incomeColor = 'var(--income)';
  const expenseColor = 'var(--expense)';
  return (
    <div>
      <ChartFrame loading={isFetching} height={height}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 400, height: 200 }}
        >
          <BarChart
            data={rows}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="24%"
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              {...axisProps}
              tickFormatter={(d: string) => bucketLabel(d, interval)}
              minTickGap={16}
            />
            <YAxis
              {...axisProps}
              width={60}
              tickFormatter={(v: number) => moneyAxis(v, currency)}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as { income: number; expense: number; net: number };
                return (
                  <TooltipBox
                    title={bucketLabel(String(label), interval, true)}
                    rows={[
                      {
                        key: 'i',
                        label: t('Income'),
                        value: money(p.income, currency),
                        color: incomeColor,
                      },
                      {
                        key: 'e',
                        label: t('Expenses'),
                        value: money(p.expense, currency),
                        color: expenseColor,
                      },
                    ]}
                    footer={
                      <span className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{t('Cash flow')}</span>
                        <span className={cn('tabular font-semibold', p.net < 0 && 'text-expense')}>
                          {money(p.net, currency, { sign: 'exceptZero' })}
                        </span>
                      </span>
                    }
                  />
                );
              }}
            />
            <Bar
              dataKey="income"
              fill={incomeColor}
              maxBarSize={20}
              isAnimationActive={false}
              shape={makeShape('income', '__topIncome')}
            />
            <Bar
              dataKey="expense"
              fill={expenseColor}
              maxBarSize={20}
              isAnimationActive={false}
              shape={makeShape('expense', '__topExpense')}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      <div className="mt-3 flex gap-4">
        <LegendItem color={incomeColor} label={t('Income')} />
        <LegendItem color={expenseColor} label={t('Expenses')} />
      </div>
    </div>
  );
}

// ───────────────────────────── Balance ─────────────────────────────

export function BalanceChart({
  scope,
  interval,
  height = 260,
  color = 'var(--primary)',
}: {
  scope: StatsScope;
  interval: Interval;
  height?: number;
  color?: string;
}) {
  const { data, isLoading, isFetching } = useBalanceTrend(scope, interval);
  if (isLoading) return <Skeleton className="w-full rounded-xl" style={{ height }} />;
  const currency = data?.currency ?? 'EUR';
  const points = data?.points ?? [];
  const gradientId = `bal-${Math.abs(hashCode(String(color)))}`;
  return (
    <ChartFrame loading={isFetching} height={height}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 400, height: 200 }}
      >
        <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            {...axisProps}
            tickFormatter={(d: string) => bucketLabel(d, interval)}
            minTickGap={24}
          />
          <YAxis
            {...axisProps}
            width={60}
            // Balances are not magnitudes: zoom to the data (nice rounded ticks) instead of forcing zero.
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => moneyAxis(v, currency)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeOpacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const v = Number(payload[0]!.value ?? 0);
              return (
                <TooltipBox
                  title={bucketLabel(String(label), interval, true)}
                  rows={[{ key: 'b', label: t('Balance'), value: money(v, currency), color }]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)', fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
