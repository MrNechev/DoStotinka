import type { Interval } from '@slavotax/shared';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { type StatsScope, useAccounts, useRecordBounds, useUser } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu';
import { Checkbox, Segmented } from '@/components/ui/misc';
import { t } from '@/i18n';
import {
  comparisonRange,
  isoDay,
  PERIOD_PRESETS,
  type PeriodState,
  periodFromParams,
  type ResolvedPeriod,
  resolvePeriod,
} from '@/lib/period';
import { cn, storage } from '@/lib/utils';

export interface StatsFilters {
  period: PeriodState;
  setPeriod: (p: PeriodState) => void;
  resolved: ResolvedPeriod;
  accountIds: string[];
  setAccountIds: (ids: string[]) => void;
  interval: Interval;
  setInterval: (i: Interval | null) => void;
  scope: StatsScope;
}

/**
 * Period + account selection stored in the URL (so views can be bookmarked) with the last
 * used period remembered per page.
 */
export function useStatsFilters(
  key: string,
  defaultPeriod: PeriodState = { preset: '30d', offset: 0 },
  fixedAccountIds?: string[],
): StatsFilters {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const remembered = storage<PeriodState>(`period.${key}`, defaultPeriod);
  const period = periodFromParams(params, remembered.get());
  const { data: bounds } = useRecordBounds();
  const resolved = resolvePeriod(period, {
    weekStartsOn: user.weekStartsOn,
    firstRecord: bounds?.first,
  });
  const accountIds = fixedAccountIds ?? params.get('accounts')?.split(',').filter(Boolean) ?? [];
  const intervalParam = params.get('interval') as Interval | null;
  const interval =
    intervalParam && ['day', 'week', 'month'].includes(intervalParam)
      ? intervalParam
      : resolved.interval;

  const update = (mutate: (p: URLSearchParams) => void) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: true },
    );
  };

  // Query keys are compared by value, so a fresh object per render is fine.
  const scope: StatsScope = {
    from: resolved.from.toISOString(),
    to: resolved.to.toISOString(),
    accountIds: accountIds.length ? [...accountIds].sort() : undefined,
    ...comparisonRange(period, resolved),
  };

  return {
    period,
    resolved,
    accountIds,
    interval,
    scope,
    setPeriod: (p) => {
      remembered.set({ ...p, offset: 0 });
      update((next) => {
        next.set('period', p.preset);
        p.offset ? next.set('offset', String(p.offset)) : next.delete('offset');
        if (p.preset === 'custom') {
          p.from ? next.set('from', p.from) : next.delete('from');
          p.to ? next.set('to', p.to) : next.delete('to');
        } else {
          next.delete('from');
          next.delete('to');
        }
        next.delete('interval');
      });
    },
    setAccountIds: (ids) =>
      update((next) =>
        ids.length ? next.set('accounts', ids.join(',')) : next.delete('accounts'),
      ),
    setInterval: (i) => update((next) => (i ? next.set('interval', i) : next.delete('interval'))),
  };
}

export function PeriodPicker({
  filters,
  className,
}: {
  filters: StatsFilters;
  className?: string;
}) {
  const { period, resolved, setPeriod } = filters;
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({
    from: period.from ?? isoDay(resolved.from),
    to: period.to ?? isoDay(new Date(resolved.to.getTime() - 1)),
  });
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {resolved.navigable && (
        <Button
          variant="outline"
          size="icon"
          aria-label={t('Previous period')}
          onClick={() => setPeriod({ ...period, offset: period.offset - 1 })}
        >
          <ChevronLeft />
        </Button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-40 justify-between">
            <span className="truncate">{resolved.label}</span>
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="p-1">
            {PERIOD_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPeriod({ preset: p.id, offset: 0 });
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
              >
                <span className={cn(period.preset === p.id && 'font-semibold')}>
                  {p.id === 'week'
                    ? t('This week')
                    : p.id === 'month'
                      ? t('This month')
                      : p.id === 'year'
                        ? t('This year')
                        : p.label}
                </span>
                {period.preset === p.id && (
                  <Check className="size-4 text-primary" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t('Custom range')}</p>
            <div className="grid gap-2">
              <Input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              />
              <Input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              />
              <Button
                size="sm"
                disabled={!custom.from || !custom.to || custom.to < custom.from}
                onClick={() => {
                  setPeriod({ preset: 'custom', offset: 0, from: custom.from, to: custom.to });
                  setOpen(false);
                }}
              >
                {t('Apply range')}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {resolved.navigable && (
        <Button
          variant="outline"
          size="icon"
          aria-label={t('Next period')}
          disabled={period.offset >= 0}
          onClick={() => setPeriod({ ...period, offset: period.offset + 1 })}
        >
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}

export function AccountFilter({
  filters,
  className,
}: {
  filters: StatsFilters;
  className?: string;
}) {
  const { data: accounts = [] } = useAccounts();
  const { accountIds, setAccountIds } = filters;
  const selected = new Set(accountIds);
  const label =
    accountIds.length === 0
      ? t('All accounts')
      : accountIds.length === 1
        ? (accounts.find((a) => a.id === accountIds[0])?.name ?? '1 account')
        : `${accountIds.length} accounts`;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAccountIds(next.size === accounts.length ? [] : [...next]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('max-w-56 justify-between', className)}>
          <Wallet className="text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="max-h-80 overflow-y-auto p-1">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
            <Checkbox checked={accountIds.length === 0} onCheckedChange={() => setAccountIds([])} />
            <span className="font-medium">{t('All accounts')}</span>
          </label>
          <div className="my-1 h-px bg-border" />
          {accounts.map((a) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={accountIds.length > 0 && selected.has(a.id)}
                onCheckedChange={() => toggle(a.id)}
              />
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: a.color }}
              />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {a.excludeFromStats && (
                <span className="text-[10px] text-muted-foreground">{t('excluded')}</span>
              )}
              <span className="text-xs text-muted-foreground">{a.currency}</span>
            </label>
          ))}
        </div>
        {accounts.some((a) => a.excludeFromStats) && (
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {t('“All accounts” leaves out accounts marked as excluded from statistics.')}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function IntervalToggle({ filters }: { filters: StatsFilters }) {
  return (
    <Segmented<Interval>
      size="sm"
      value={filters.interval}
      onChange={(i) => filters.setInterval(i === filters.resolved.interval ? null : i)}
      options={[
        { value: 'day', label: t('Day') },
        { value: 'week', label: t('Week') },
        { value: 'month', label: t('Month') },
      ]}
    />
  );
}

export function FilterBar({
  filters,
  showAccounts = true,
  children,
}: {
  filters: StatsFilters;
  showAccounts?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <PeriodPicker filters={filters} />
      {showAccounts && <AccountFilter filters={filters} />}
      {children}
    </div>
  );
}
