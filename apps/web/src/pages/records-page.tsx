import { CheckSquare, Download, FileUp, Plus, Search, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { buildQuery } from '@/api/client';
import { useCategories, useLabels, useRecordSummary, useRecords } from '@/api/queries';
import { CategoryPickerPanel } from '@/components/categories/category-picker';
import { BulkBar } from '@/components/records/bulk-bar';
import { useRecordEditor } from '@/components/records/record-editor';
import { RecordList } from '@/components/records/record-list';
import { AccountFilter, PeriodPicker, useStatsFilters } from '@/components/stats/filters';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu';
import { Card, PageHeader, Segmented } from '@/components/ui/misc';
import { buildCategoryIndex } from '@/lib/categories';
import { money } from '@/lib/format';
import { browserTimeZone, cn, downloadUrl } from '@/lib/utils';

type TypeFilter = 'all' | 'expense' | 'income' | 'transfer';

export default function RecordsPage() {
  const filters = useStatsFilters('records', { preset: 'all', offset: 0 });
  const [params, setParams] = useSearchParams();
  const { openNew } = useRecordEditor();
  const { data: categories } = useCategories();
  const { data: labels = [] } = useLabels();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const type = (params.get('types') as TypeFilter | null) ?? 'all';
  const categoryId = params.get('categories');
  const labelId = params.get('labels');
  const [search, setSearch] = useState(params.get('q') ?? '');

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        value ? next.set(key, value) : next.delete(key);
        return next;
      },
      { replace: true },
    );

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search) setParam('q', search.trim() || null);
    }, 300);
    return () => clearTimeout(t);
  });

  const query = {
    from: filters.scope.from,
    to: filters.scope.to,
    accountIds: filters.accountIds.length ? filters.accountIds : undefined,
    types: type === 'all' ? undefined : [type],
    categoryIds: categoryId ? [categoryId] : undefined,
    labelIds: labelId ? [labelId] : undefined,
    search: params.get('q') ?? undefined,
  };
  const records = useRecords(query);
  const items = records.data?.pages.flatMap((p) => p.items) ?? [];
  const summary = useRecordSummary(query);

  const category = categoryId ? index.byId.get(categoryId) : undefined;
  const label = labelId ? labels.find((l) => l.id === labelId) : undefined;

  // Exports exactly what is shown: the same filters as the list.
  const exportCsv = () =>
    downloadUrl(`/api/export/records.csv${buildQuery({ ...query, tz: browserTimeZone() })}`);

  return (
    <div>
      <PageHeader
        title="Records"
        description="Every expense, income and transfer you have logged."
        actions={
          <>
            <Button
              variant={selecting ? 'secondary' : 'outline'}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              <CheckSquare />{' '}
              <span className="hidden sm:inline">{selecting ? 'Done' : 'Select'}</span>
              <span className="sm:hidden">{selecting ? 'Done' : ''}</span>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/import">
                <FileUp /> <span className="hidden sm:inline">Import</span>
              </Link>
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download /> <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button onClick={() => openNew()} className="hidden sm:inline-flex">
              <Plus /> Add record
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodPicker filters={filters} />
        <AccountFilter filters={filters} />
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn(category && 'pr-2')}>
              {category ? (
                <>
                  <IconBadge icon={category.icon} color={index.colorOf(category.id)} size="xs" />
                  <span className="max-w-40 truncate">{category.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-0.5 hover:bg-muted"
                    onClick={(e) => {
                      e.stopPropagation();
                      setParam('categories', null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && setParam('categories', null)}
                    aria-label="Clear category"
                  >
                    <X className="size-3.5" />
                  </span>
                </>
              ) : (
                'All categories'
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(92vw,420px)] p-3">
            <CategoryPickerPanel
              kind="expense"
              value={categoryId}
              onSelect={(id) => {
                setParam('categories', id);
                setCategoryOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {labels.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Tag className="text-muted-foreground" />
                {label ? label.name : 'All labels'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1">
              <button
                type="button"
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                onClick={() => setParam('labels', null)}
              >
                All labels
              </button>
              {labels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => setParam('labels', l.id)}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<TypeFilter>
          value={type}
          onChange={(t) => setParam('types', t === 'all' ? null : t)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfers' },
          ]}
        />
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes, payees, categories…"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {summary.data && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {summary.data.count} {summary.data.count === 1 ? 'record' : 'records'}
            </span>
            {summary.data.income > 0 && (
              <span>
                <span className="text-muted-foreground">Income </span>
                <span className="tabular font-semibold text-income">
                  {money(summary.data.income, summary.data.currency)}
                </span>
              </span>
            )}
            {summary.data.expense > 0 && (
              <span>
                <span className="text-muted-foreground">Expenses </span>
                <span className="tabular font-semibold text-expense">
                  {money(summary.data.expense, summary.data.currency)}
                </span>
              </span>
            )}
            {summary.data.income > 0 && summary.data.expense > 0 && (
              <span>
                <span className="text-muted-foreground">Cash flow </span>
                <span className="tabular font-semibold">
                  {money(summary.data.net, summary.data.currency, { sign: 'exceptZero' })}
                </span>
              </span>
            )}
          </div>
        )}
        <RecordList
          records={items}
          isLoading={records.isLoading}
          hasMore={records.hasNextPage}
          loadingMore={records.isFetchingNextPage}
          onLoadMore={() => void records.fetchNextPage()}
          emptyTitle="No records found"
          emptyDescription="Try a different period or filter – or add a new record."
          selection={selecting ? { selected, toggle } : undefined}
        />
      </Card>
      {selecting && (
        <BulkBar
          selected={[...selected]}
          totalLoaded={items.length}
          onSelectAll={() => setSelected(new Set(items.map((r) => r.id)))}
          onClear={stopSelecting}
        />
      )}
    </div>
  );
}
