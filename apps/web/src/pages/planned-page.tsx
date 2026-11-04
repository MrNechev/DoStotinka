import type { PlannedPayment } from '@dostotinka/shared';
import { parseISO } from 'date-fns';
import {
  CalendarClock,
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useDeletePlanned,
  usePlanned,
  useSkipPlanned,
  useUpcoming,
  useUser,
} from '@/api/queries';
import { PayDialog } from '@/components/planned/pay-dialog';
import { PlannedFormDialog } from '@/components/planned/planned-form';
import { plannedIcon, UpcomingList } from '@/components/planned/upcoming-list';
import { useRecordLookups } from '@/components/records/record-list';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { fmt } from '@/lib/date';
import { dueLabel, money, recurrenceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

function joinTotals(parts: (readonly [string, number])[], base: string) {
  const nonZero = parts.filter(([, v]) => v > 0);
  return nonZero.length ? nonZero.map(([c, v]) => money(v, c)).join(' + ') : money(0, base);
}

export default function PlannedPage() {
  const user = useUser();
  const { data: planned, isLoading } = usePlanned();
  const { data: upcoming = [] } = useUpcoming(30);
  const { data: accounts = [] } = useAccounts();
  const lookups = useRecordLookups();
  const skip = useSkipPlanned();
  const remove = useDeletePlanned();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<PlannedPayment | 'new' | null>(null);
  const [paying, setPaying] = useState<PlannedPayment | null>(null);

  const byId = useMemo(() => new Map((planned ?? []).map((p) => [p.id, p])), [planned]);
  const totals = useMemo(() => {
    const t = new Map<string, { expense: number; income: number }>();
    for (const o of upcoming) {
      const p = byId.get(o.plannedPaymentId);
      if (!p || p.type === 'transfer') continue;
      const e = t.get(p.currency) ?? { expense: 0, income: 0 };
      e[p.type] += p.amount;
      t.set(p.currency, e);
    }
    return [...t.entries()];
  }, [upcoming, byId]);
  const overdue = upcoming.filter((o) => o.overdue).length;

  const active = (planned ?? []).filter((p) => p.nextDueDate);
  const finished = (planned ?? []).filter((p) => !p.nextDueDate);

  const onDelete = async (p: PlannedPayment) => {
    const ok = await confirm({
      title: t('Delete “{name}”?', { name: p.name }),
      description: t('Records that were already created stay untouched.'),
      confirmLabel: t('Delete'),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(p.id, {
      onSuccess: () => toast.success(t('Planned payment deleted')),
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const renderRow = (p: PlannedPayment) => {
    const { icon, color } = plannedIcon(p, lookups);
    const account = accounts.find((a) => a.id === p.accountId);
    const to = p.toAccountId ? accounts.find((a) => a.id === p.toAccountId) : undefined;
    const isOverdue = !!p.nextDueDate && p.nextDueDate < fmt(new Date(), 'yyyy-MM-dd');
    return (
      <div key={p.id} className="flex items-center gap-3 px-4 py-3">
        <IconBadge icon={icon} color={color} size="md" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-medium">{p.name}</span>
            {isOverdue && <Badge tone="danger">{t('overdue')}</Badge>}
            {p.autoConfirm && <Badge tone="info">{t('auto')}</Badge>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {recurrenceLabel(p)} · {account?.name ?? '—'}
            {to ? ` → ${to.name}` : ''}
            {p.type !== 'transfer' && p.categoryId
              ? ` · ${lookups.categories.nameOf(p.categoryId)}`
              : ''}
          </p>
          <p
            className={cn(
              'text-xs',
              isOverdue ? 'font-medium text-expense' : 'text-muted-foreground',
            )}
          >
            {p.nextDueDate
              ? `${t('Next: {date}', { date: fmt(parseISO(p.nextDueDate), 'EEE, d MMM yyyy') })} · ${dueLabel(p.nextDueDate)}`
              : t('Finished')}
            {p.paidCount > 0 && ` · ${t('paid {n}×', { n: p.paidCount })}`}
          </p>
        </div>
        <span
          className={cn(
            'tabular shrink-0 text-sm font-semibold',
            p.type === 'expense' ? 'text-expense' : p.type === 'income' ? 'text-income' : '',
          )}
        >
          {money(p.type === 'expense' ? -p.amount : p.amount, p.currency, {
            sign: p.type === 'transfer' ? 'auto' : 'exceptZero',
          })}
        </span>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('Actions')}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {p.nextDueDate && (
              <>
                <MenuItem icon={<Check />} onSelect={() => setPaying(p)}>
                  {t('Mark next as paid')}
                </MenuItem>
                <MenuItem
                  icon={<SkipForward />}
                  onSelect={() =>
                    skip.mutate(p.id, {
                      onSuccess: () => toast.success(t('Occurrence skipped')),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  {t('Skip next')}
                </MenuItem>
                <MenuSeparator />
              </>
            )}
            <MenuItem icon={<Pencil />} onSelect={() => setEditing(p)}>
              {t('Edit')}
            </MenuItem>
            <MenuItem icon={<Trash2 />} destructive onSelect={() => void onDelete(p)}>
              {t('Delete')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={t('Planned payments')}
        description={t(
          'Rent, bills, subscriptions and income you know are coming. Confirm them when they are paid.',
        )}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('New planned payment')}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Overdue')}</p>
          <p className={cn('mt-1 text-2xl font-semibold', overdue > 0 && 'text-expense')}>
            {overdue}
          </p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Due in 30 days')}</p>
          <p className="mt-1 text-2xl font-semibold">{upcoming.length - overdue}</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Expected expenses')}</p>
          <p className="tabular mt-1 truncate text-xl font-semibold text-expense">
            {joinTotals(
              totals.map(([c, t]) => [c, t.expense] as const),
              user.baseCurrency,
            )}
          </p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Expected income')}</p>
          <p className="tabular mt-1 truncate text-xl font-semibold text-income">
            {joinTotals(
              totals.map(([c, t]) => [c, t.income] as const),
              user.baseCurrency,
            )}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title={t('Next 30 days')} description={t('Including overdue payments')} />
          <UpcomingList days={30} />
        </Card>
        <Card className="overflow-hidden">
          <CardHeader
            title={t('All planned payments')}
            description={tn(active.length, '{n} active payment', '{n} active payments')}
          />
          {isLoading ? (
            <div className="grid gap-3 p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : !planned?.length ? (
            <EmptyState
              icon={<CalendarClock />}
              title={t('No planned payments yet')}
              description={t(
                'Add recurring bills like rent or your phone plan and never miss a payment again.',
              )}
              action={
                <Button onClick={() => setEditing('new')}>
                  <Plus /> {t('New planned payment')}
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {active.map((p) => renderRow(p))}
              {finished.length > 0 && (
                <>
                  <p className="bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('Finished')}
                  </p>
                  {finished.map((p) => renderRow(p))}
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <PlannedFormDialog
          plan={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {paying?.nextDueDate && (
        <PayDialog plan={paying} dueDate={paying.nextDueDate} onClose={() => setPaying(null)} />
      )}
    </div>
  );
}
