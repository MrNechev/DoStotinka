import { ACCOUNT_TYPE_LABELS, type AccountType } from '@dostotinka/shared';
import { useState } from 'react';
import { useNetWorth } from '@/api/queries';
import { ACCOUNT_TYPE_ICONS } from '@/components/accounts/account-card';
import { HoldingsCard } from '@/components/investments/holdings';
import { ValueChart } from '@/components/stats/charts';
import { IconBadge } from '@/components/ui/category-icon';
import { Card, CardHeader, PageHeader, Segmented, Skeleton } from '@/components/ui/misc';
import { t } from '@/i18n';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

const RANGES = [12, 24, 60, 120] as const;

function groupLabel(key: string) {
  if (key === 'lent') return t('Money lent');
  if (key === 'borrowed') return t('Money borrowed');
  return t(ACCOUNT_TYPE_LABELS[key as AccountType] ?? key);
}
const groupIcon = (key: string) =>
  key === 'lent' || key === 'borrowed' ? 'handshake' : (ACCOUNT_TYPE_ICONS[key] ?? 'wallet');

export default function NetWorthPage() {
  const [months, setMonths] = useState<(typeof RANGES)[number]>(24);
  const { data, isLoading } = useNetWorth(months);
  const max = Math.max(1, ...(data?.groups ?? []).map((g) => Math.abs(g.amount)));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('Net worth')}
        description={t(
          'Everything you own minus everything you owe – accounts, investments, property and debts.',
        )}
      />
      {isLoading || !data ? (
        <div className="grid gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('Net worth')}</p>
                <p
                  className={cn(
                    'tabular text-3xl font-semibold tracking-tight',
                    data.total < 0 && 'text-expense',
                  )}
                >
                  {money(data.total, data.currency)}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t('Assets')}{' '}
                    <span className="tabular font-medium text-foreground">
                      {money(data.assets, data.currency)}
                    </span>
                  </span>
                  <span>
                    {t('Liabilities')}{' '}
                    <span className="tabular font-medium text-foreground">
                      {money(data.liabilities, data.currency)}
                    </span>
                  </span>
                  {data.investmentGain !== 0 && (
                    <span>
                      {t('Investment gain')}{' '}
                      <span
                        className={cn(
                          'tabular font-medium',
                          data.investmentGain > 0 ? 'text-income' : 'text-expense',
                        )}
                      >
                        {money(data.investmentGain, data.currency, { sign: 'exceptZero' })}
                      </span>
                    </span>
                  )}
                </p>
              </div>
              <Segmented<string>
                value={String(months)}
                onChange={(v) => setMonths(Number(v) as (typeof RANGES)[number])}
                options={[
                  { value: '12', label: t('1 year') },
                  { value: '24', label: t('2 years') },
                  { value: '60', label: t('5 years') },
                  { value: '120', label: t('10 years') },
                ]}
              />
            </div>
            <div className="mt-4">
              <ValueChart points={data.history} currency={data.currency} label={t('Net worth')} />
            </div>
            {data.groups.some((g) => g.key === 'lent' || g.key === 'borrowed') && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  'The chart shows accounts and investments; money lent and borrowed is in the total.',
                )}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title={t('What it is made of')} />
            <ul className="grid gap-3 px-5 pb-5">
              {data.groups.map((g) => (
                <li key={g.key}>
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <IconBadge
                      icon={groupIcon(g.key)}
                      color={g.amount < 0 ? '#E11D48' : '#0EA5E9'}
                      size="xs"
                    />
                    <span className="min-w-0 flex-1 truncate">{groupLabel(g.key)}</span>
                    <span className={cn('tabular font-medium', g.amount < 0 && 'text-expense')}>
                      {money(g.amount, data.currency)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        g.amount < 0 ? 'bg-expense' : 'bg-primary',
                      )}
                      style={{ width: `${(Math.abs(g.amount) / max) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <HoldingsCard />
        </div>
      )}
    </div>
  );
}
