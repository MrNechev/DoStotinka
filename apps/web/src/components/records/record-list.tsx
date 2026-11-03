import type { Account, Label, RecordItem } from '@slavotax/shared';
import { format, parseISO } from 'date-fns';
import { CalendarClock, Check, Inbox } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useAccounts, useCategories, useLabels } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { buildCategoryIndex, type CategoryIndex } from '@/lib/categories';
import { dayLabel, money, timeLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useRecordEditor } from './record-editor';

interface Lookups {
  accounts: Map<string, Account>;
  categories: CategoryIndex;
  labels: Map<string, Label>;
}

export function useRecordLookups(): Lookups {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: labels = [] } = useLabels();
  return useMemo(
    () => ({
      accounts: new Map(accounts.map((a) => [a.id, a])),
      categories: buildCategoryIndex(categories),
      labels: new Map(labels.map((l) => [l.id, l])),
    }),
    [accounts, categories, labels],
  );
}

export interface Selection {
  selected: Set<string>;
  toggle: (id: string) => void;
}

export function RecordRow({
  record,
  lookups,
  showAccount = true,
  showDate = false,
  selection,
}: {
  record: RecordItem;
  lookups: Lookups;
  showAccount?: boolean;
  showDate?: boolean;
  selection?: Selection;
}) {
  const { openEdit } = useRecordEditor();
  const account = lookups.accounts.get(record.accountId);
  const counterpart = record.counterpartAccountId
    ? lookups.accounts.get(record.counterpartAccountId)
    : undefined;
  const isTransfer = record.type === 'transfer';
  const cat = lookups.categories;
  const title = isTransfer
    ? record.amount < 0
      ? `Transfer to ${counterpart?.name ?? 'deleted account'}`
      : `Transfer from ${counterpart?.name ?? 'deleted account'}`
    : cat.nameOf(record.categoryId);
  const parentName =
    !isTransfer && record.categoryId ? cat.parentOf(record.categoryId)?.name : undefined;
  const details = [record.payee, record.note].filter(Boolean).join(' · ');
  const amountClass = isTransfer
    ? 'text-foreground'
    : record.amount < 0
      ? 'text-expense'
      : 'text-income';

  return (
    <button
      type="button"
      onClick={() => (selection ? selection.toggle(record.id) : openEdit(record))}
      aria-pressed={selection ? selection.selected.has(record.id) : undefined}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/70',
        selection?.selected.has(record.id) && 'bg-primary-soft hover:bg-primary-soft',
      )}
    >
      {selection && (
        // Visual checkbox only – the whole row is the (button) control.
        <span
          aria-hidden
          className={cn(
            'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-input bg-card',
            selection.selected.has(record.id) &&
              'border-primary bg-primary text-primary-foreground',
          )}
        >
          {selection.selected.has(record.id) && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      )}
      {isTransfer ? (
        <IconBadge icon="arrow-left-right" color="#64748B" size="md" />
      ) : (
        <IconBadge
          icon={cat.iconOf(record.categoryId)}
          color={cat.colorOf(record.categoryId)}
          size="md"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {record.plannedPaymentId && (
            <CalendarClock
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="From a planned payment"
            />
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {showAccount && account && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: account.color }} />
              {account.name}
            </span>
          )}
          {showAccount && account && (parentName || details) && <span>·</span>}
          {parentName && !details && <span className="truncate">{parentName}</span>}
          {details && <span className="truncate">{details}</span>}
        </span>
        {record.labelIds.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {record.labelIds.map((id) => {
              const l = lookups.labels.get(id);
              if (!l) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.name}
                </span>
              );
            })}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className={cn('tabular block text-sm font-semibold', amountClass)}>
          {money(record.amount, record.currency, { sign: isTransfer ? 'auto' : 'exceptZero' })}
        </span>
        <span className="block text-xs text-muted-foreground">
          {showDate ? format(parseISO(record.occurredAt), 'd MMM') : timeLabel(record.occurredAt)}
        </span>
      </span>
    </button>
  );
}

/** Records grouped by calendar day with daily totals. */
export function RecordList({
  records,
  isLoading,
  hasMore,
  onLoadMore,
  loadingMore,
  showAccount = true,
  emptyTitle = 'No records yet',
  emptyDescription,
  emptyAction,
  selection,
}: {
  records: RecordItem[];
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  showAccount?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  selection?: Selection;
}) {
  const lookups = useRecordLookups();
  const groups = useMemo(() => {
    const map = new Map<string, RecordItem[]>();
    for (const r of records) {
      const day = format(parseISO(r.occurredAt), 'yyyy-MM-dd');
      const list = map.get(day) ?? [];
      list.push(r);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [records]);

  if (isLoading) {
    return (
      <div className="grid gap-2 p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-1.5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }
  if (!records.length) {
    return (
      <EmptyState
        icon={<Inbox />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }
  return (
    <div className="pb-2">
      {groups.map(([day, items]) => {
        // Daily totals per currency (transfers excluded).
        const totals = new Map<string, number>();
        for (const r of items) {
          if (r.type === 'transfer') continue;
          totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount);
        }
        return (
          <section key={day}>
            <div className="sticky top-14 z-10 flex items-center justify-between bg-card/95 px-4 py-2 backdrop-blur lg:top-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {dayLabel(day)}
              </h3>
              <span className="flex gap-2">
                {[...totals.entries()].map(([cur, v]) => (
                  <span
                    key={cur}
                    className={cn(
                      'tabular text-xs font-medium',
                      v < 0 ? 'text-expense' : 'text-income',
                    )}
                  >
                    {money(v, cur, { sign: 'exceptZero' })}
                  </span>
                ))}
              </span>
            </div>
            <div className="px-1">
              {items.map((r) => (
                <RecordRow
                  key={r.id}
                  record={r}
                  lookups={lookups}
                  showAccount={showAccount}
                  selection={selection}
                />
              ))}
            </div>
          </section>
        );
      })}
      {hasMore && <LoadMore onLoadMore={onLoadMore} loading={loadingMore} />}
    </div>
  );
}

/** Loads the next page automatically when it scrolls into view (button as fallback). */
function LoadMore({ onLoadMore, loading }: { onLoadMore?: () => void; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onLoadMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loading) onLoadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, loading]);
  return (
    <div ref={ref} className="flex justify-center p-3">
      <Button variant="outline" onClick={onLoadMore} loading={loading}>
        Load more
      </Button>
    </div>
  );
}
