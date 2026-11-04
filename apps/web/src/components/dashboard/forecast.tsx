import { convertMinor, type PlannedPayment } from '@dostotinka/shared';
import { endOfMonth } from 'date-fns';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useAccounts, useCurrencies, usePlanned, useUpcoming, useUser } from '@/api/queries';
import { Card } from '@/components/ui/misc';
import { t } from '@/i18n';
import { fmt } from '@/lib/date';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Expected total balance at the end of the month: today's balance plus open planned payments. */
export function MonthEndForecast() {
  const user = useUser();
  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: planned } = usePlanned();
  const now = new Date();
  const daysLeft = Math.max(
    0,
    Math.round((endOfMonth(now).getTime() - now.getTime()) / 86_400_000),
  );
  const { data: upcoming } = useUpcoming(daysLeft);
  if (!accounts || !currencies || !planned || !upcoming) return null;

  const rates: Record<string, number> = { [currencies.baseCurrency]: 1 };
  for (const r of currencies.rates) rates[r.currency] = r.rate;
  const included = new Map(
    accounts.filter((a) => !a.archived && !a.excludeFromStats).map((a) => [a.id, a]),
  );
  const toBase = (amount: number, currency: string) =>
    convertMinor(amount, currency, user.baseCurrency, rates);

  const balance = [...included.values()].reduce((s, a) => s + toBase(a.balance, a.currency), 0);
  const byId = new Map<string, PlannedPayment>(planned.map((p) => [p.id, p]));
  const monthEnd = fmt(endOfMonth(now), 'yyyy-MM-dd');
  let incoming = 0;
  let outgoing = 0;
  for (const o of upcoming) {
    if (o.dueDate > monthEnd) continue;
    const p = byId.get(o.plannedPaymentId);
    if (!p) continue;
    const value = toBase(p.amount, p.currency);
    if (p.type === 'income' && included.has(p.accountId)) incoming += value;
    else if (p.type === 'expense' && included.has(p.accountId)) outgoing += value;
    else if (p.type === 'transfer') {
      // Transfers only matter when money leaves or enters the included accounts.
      const from = included.has(p.accountId);
      const to = p.toAccountId ? included.has(p.toAccountId) : false;
      if (from && !to) outgoing += value;
      if (!from && to) incoming += value;
    }
  }
  const forecast = balance + incoming - outgoing;
  const up = forecast >= balance;

  return (
    <Card className="px-4 py-3.5">
      <p className="text-xs font-medium text-muted-foreground">
        {t('Expected at the end of {month}', { month: fmt(now, 'MMMM') })}
      </p>
      <p className="tabular mt-1 text-2xl font-semibold">{money(forecast, user.baseCurrency)}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'inline-flex items-center gap-0.5 font-medium',
            up ? 'text-income' : 'text-expense',
          )}
        >
          {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {money(forecast - balance, user.baseCurrency, { sign: 'exceptZero' })}
        </span>
        <span>
          {t('{incoming} planned in · {outgoing} planned out', {
            incoming: money(incoming, user.baseCurrency),
            outgoing: money(outgoing, user.baseCurrency),
          })}
        </span>
      </p>
    </Card>
  );
}
