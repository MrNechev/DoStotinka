import { occurrencesBetween, type PlannedPayment } from '@dostotinka/shared';
import {
  addDays,
  addMonths,
  endOfMonth,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePlanned, useRecords, useTimeseries, useUser } from '@/api/queries';
import { plannedIcon } from '@/components/planned/upcoming-list';
import { useRecordEditor } from '@/components/records/record-editor';
import { RecordRow, useRecordLookups } from '@/components/records/record-list';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { fmt } from '@/lib/date';
import { longDate, money } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function CalendarPage() {
  const user = useUser();
  const { openNew } = useRecordEditor();
  const lookups = useRecordLookups();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => fmt(new Date(), 'yyyy-MM-dd'));

  const gridStart = startOfWeek(month, { weekStartsOn: user.weekStartsOn });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const lastRowNeeded = days.findIndex((d, i) => i % 7 === 0 && d > endOfMonth(month));
  const visibleDays = lastRowNeeded > 0 ? days.slice(0, lastRowNeeded) : days;

  const scope = {
    from: visibleDays[0]!.toISOString(),
    to: addDays(visibleDays[visibleDays.length - 1]!, 1).toISOString(),
  };
  const rangeFrom = fmt(visibleDays[0]!, 'yyyy-MM-dd');
  const rangeTo = fmt(visibleDays[visibleDays.length - 1]!, 'yyyy-MM-dd');
  const expenses = useTimeseries(scope, 'day', 'expense');
  const income = useTimeseries(scope, 'day', 'income');
  const { data: planned = [] } = usePlanned();

  const expenseBy = new Map((expenses.data?.points ?? []).map((p) => [p.date, p.total]));
  const incomeBy = new Map((income.data?.points ?? []).map((p) => [p.date, p.total]));
  const maxExpense = Math.max(1, ...expenseBy.values());
  const currency = expenses.data?.currency ?? user.baseCurrency;

  // Open (unpaid) planned occurrences in the visible range.
  const dueBy = useMemo(() => {
    const map = new Map<string, PlannedPayment[]>();
    const from = rangeFrom;
    const to = rangeTo;
    for (const p of planned) {
      if (!p.nextDueDate) continue;
      const start = p.nextDueDate > from ? p.nextDueDate : from;
      const rule = {
        frequency: p.frequency,
        interval: p.interval,
        startDate: p.startDate,
        endDate: p.endDate,
      };
      for (const d of occurrencesBetween(
        rule,
        start < p.nextDueDate ? p.nextDueDate : start,
        to,
        60,
      )) {
        if (d < p.nextDueDate) continue;
        const list = map.get(d) ?? [];
        list.push(p);
        map.set(d, list);
      }
    }
    return map;
  }, [planned, rangeFrom, rangeTo]);

  const dayStart = parseISO(selected);
  const dayRecords = useRecords(
    { from: dayStart.toISOString(), to: addDays(dayStart, 1).toISOString() },
    100,
  );
  const selectedRecords = dayRecords.data?.pages.flatMap((p) => p.items) ?? [];
  const selectedDue = dueBy.get(selected) ?? [];
  const today = fmt(new Date(), 'yyyy-MM-dd');

  const monthExpense = [...expenseBy.entries()]
    .filter(([d]) => d.startsWith(fmt(month, 'yyyy-MM')))
    .reduce((s, [, v]) => s + v, 0);
  const monthIncome = [...incomeBy.entries()]
    .filter(([d]) => d.startsWith(fmt(month, 'yyyy-MM')))
    .reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <PageHeader
        title={t('Calendar')}
        description={t('Your spending day by day, together with upcoming planned payments.')}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label={t('Previous month')}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-36 text-center font-semibold">{fmt(month, 'MMMM yyyy')}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonth(addMonths(month, 1))}
              aria-label={t('Next month')}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setSelected(today);
              }}
            >
              {t('Today')}
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-sm">
            <span>
              <span className="text-muted-foreground">{t('Spent')} </span>
              <span className="tabular font-semibold text-expense">
                {money(monthExpense, currency)}
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">{t('Received')} </span>
              <span className="tabular font-semibold text-income">
                {money(monthIncome, currency)}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {visibleDays.slice(0, 7).map((d) => (
              <div
                key={d.toISOString()}
                className="py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {fmt(d, 'EEE')}
              </div>
            ))}
          </div>
          <div
            className={cn(
              'grid grid-cols-7 transition-opacity',
              (expenses.isFetching || income.isFetching) && 'opacity-70',
            )}
          >
            {visibleDays.map((d) => {
              const key = fmt(d, 'yyyy-MM-dd');
              const exp = expenseBy.get(key) ?? 0;
              const inc = incomeBy.get(key) ?? 0;
              const due = dueBy.get(key) ?? [];
              const inMonth = isSameMonth(d, month);
              const intensity = exp ? 0.06 + 0.3 * Math.sqrt(exp / maxExpense) : 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={cn(
                    'relative flex min-h-20 cursor-pointer flex-col items-stretch gap-0.5 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-muted/60 sm:min-h-24 sm:p-2 [&:nth-child(7n)]:border-r-0',
                    !inMonth && 'opacity-40',
                    selected === key && 'ring-2 ring-inset ring-primary',
                  )}
                  style={
                    intensity
                      ? {
                          backgroundColor: `color-mix(in srgb, var(--expense) ${Math.round(intensity * 100)}%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-xs font-medium',
                      isToday(d) && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {fmt(d, 'd')}
                  </span>
                  {exp > 0 && (
                    <span className="tabular truncate text-[10px] font-semibold text-expense sm:text-xs">
                      −{money(exp, currency, { compact: true })}
                    </span>
                  )}
                  {inc > 0 && (
                    <span className="tabular truncate text-[10px] font-semibold text-income sm:text-xs">
                      +{money(inc, currency, { compact: true })}
                    </span>
                  )}
                  {due.length > 0 && (
                    <span className="mt-auto flex items-center gap-0.5">
                      <CalendarClock
                        className={cn('size-3', key < today ? 'text-expense' : 'text-warning')}
                      />
                      <span className="text-[10px] text-muted-foreground">{due.length}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={longDate(selected)}
            description={tn(selectedRecords.length, '{n} record', '{n} records')}
            action={
              <Button size="sm" variant="outline" onClick={() => openNew({ date: selected })}>
                <Plus /> {t('Add')}
              </Button>
            }
          />
          {selectedDue.length > 0 && (
            <div className="mx-3 mb-2 rounded-xl border border-dashed border-border p-2">
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                {selected < today ? t('Overdue planned payments') : t('Planned payments due')}
              </p>
              {selectedDue.map((p) => {
                const { icon, color } = plannedIcon(p, lookups);
                return (
                  <div key={p.id} className="flex items-center gap-3 px-2 py-1.5">
                    <IconBadge icon={icon} color={color} size="sm" variant="soft" />
                    <span className="flex-1 truncate text-sm">{p.name}</span>
                    <span className="tabular text-sm font-medium">
                      {money(p.type === 'expense' ? -p.amount : p.amount, p.currency, {
                        sign: p.type === 'transfer' ? 'auto' : 'exceptZero',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="px-1 pb-3">
            {selectedRecords.length === 0 ? (
              <EmptyState title={t('Nothing recorded on this day')} className="py-8" />
            ) : (
              selectedRecords.map((r) => <RecordRow key={r.id} record={r} lookups={lookups} />)
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
