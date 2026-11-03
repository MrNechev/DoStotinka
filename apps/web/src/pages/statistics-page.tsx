import { addDays, addMonths, format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCategories } from '@/api/queries';
import {
  BalanceChart,
  CashflowChart,
  CategoryBreakdown,
  CategoryTimeChart,
  KpiTiles,
} from '@/components/stats/charts';
import {
  AccountFilter,
  IntervalToggle,
  PeriodPicker,
  useStatsFilters,
} from '@/components/stats/filters';
import { CategoryReport } from '@/components/stats/report';
import { Select } from '@/components/ui/input';
import { Card, CardHeader, PageHeader, Segmented } from '@/components/ui/misc';
import { buildCategoryIndex } from '@/lib/categories';

export default function StatisticsPage() {
  const filters = useStatsFilters('statistics', { preset: '30d', offset: 0 });
  const { data: categories } = useCategories();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState<string>('');

  const recordsLink = (id: string | null) => {
    const p = new URLSearchParams({ period: filters.period.preset });
    if (filters.period.offset) p.set('offset', String(filters.period.offset));
    if (filters.period.from) p.set('from', filters.period.from);
    if (filters.period.to) p.set('to', filters.period.to);
    if (filters.accountIds.length) p.set('accounts', filters.accountIds.join(','));
    if (id) p.set('categories', id);
    return `/records?${p.toString()}`;
  };

  const groups = index.topLevel(type);
  // Keep the report readable: at most ~15 columns.
  const reportInterval =
    filters.interval === 'day' && filters.resolved.days > 14
      ? 'week'
      : filters.interval === 'week' && filters.resolved.days > 120
        ? 'month'
        : filters.interval;

  return (
    <div>
      <PageHeader
        title="Statistics"
        description="Understand where your money comes from and where it goes."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <PeriodPicker filters={filters} />
        <AccountFilter filters={filters} />
        <IntervalToggle filters={filters} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <KpiTiles scope={filters.scope} />

        <Card>
          <CardHeader
            title={type === 'expense' ? 'Spending over time' : 'Income over time'}
            description={`${filters.resolved.label} · per ${filters.interval}${categoryId ? ` · ${index.nameOf(categoryId)}` : ' · by category'} · click a bar to see its records`}
            action={
              <Segmented<'expense' | 'income'>
                size="sm"
                value={type}
                onChange={(t) => {
                  setType(t);
                  setCategoryId('');
                }}
                options={[
                  { value: 'expense', label: 'Expenses' },
                  { value: 'income', label: 'Income' },
                ]}
              />
            }
          />
          <div className="px-5 pb-2">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-9"
              containerClassName="w-full sm:w-72"
              aria-label="Category filter"
            >
              <option value="">All categories</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  <option value={g.id}>{g.name} – all</option>
                  {index
                    .childrenOf(g.id)
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div className="px-3 pb-4 sm:px-5">
            <CategoryTimeChart
              scope={filters.scope}
              interval={filters.interval}
              type={type}
              categoryId={categoryId || null}
              onSegmentClick={(date, cat) => {
                // Open the records behind a bar segment: that bucket and category.
                const start = parseISO(date);
                const end =
                  filters.interval === 'day'
                    ? start
                    : filters.interval === 'week'
                      ? addDays(start, 6)
                      : addDays(addMonths(start, 1), -1);
                const p = new URLSearchParams({
                  period: 'custom',
                  from: format(start, 'yyyy-MM-dd'),
                  to: format(end, 'yyyy-MM-dd'),
                  types: type,
                });
                if (filters.accountIds.length) p.set('accounts', filters.accountIds.join(','));
                if (cat) p.set('categories', cat);
                navigate(`/records?${p.toString()}`);
              }}
            />
          </div>
        </Card>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <CategoryBreakdown scope={filters.scope} type="expense" recordsLink={recordsLink} />
          <CategoryBreakdown scope={filters.scope} type="income" recordsLink={recordsLink} />
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Cash flow" description="Income vs expenses" />
            <div className="px-3 pb-4">
              <CashflowChart scope={filters.scope} interval={filters.interval} />
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Balance trend"
              description="Total balance of the selected accounts"
            />
            <div className="px-3 pb-4">
              <BalanceChart scope={filters.scope} interval={filters.interval} height={280} />
            </div>
          </Card>
        </div>
        <Card className="overflow-hidden">
          <CardHeader
            title="Report"
            description={`Income and expenses per category and ${reportInterval} – click a category to see its subcategories`}
          />
          <CategoryReport scope={filters.scope} interval={reportInterval} />
        </Card>
      </div>
    </div>
  );
}
