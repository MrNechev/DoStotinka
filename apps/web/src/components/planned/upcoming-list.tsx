import type { PlannedPayment, UpcomingOccurrence } from '@slavotax/shared';
import { format, parseISO } from 'date-fns';
import { Check, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { usePlanned, useSkipPlanned, useUpcoming } from '@/api/queries';
import { useRecordLookups } from '@/components/records/record-list';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { dueLabel, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PayDialog } from './pay-dialog';

export function plannedIcon(p: PlannedPayment, lookups: ReturnType<typeof useRecordLookups>) {
  if (p.type === 'transfer') return { icon: 'arrow-left-right', color: '#64748B' };
  return {
    icon: lookups.categories.iconOf(p.categoryId),
    color: lookups.categories.colorOf(p.categoryId),
  };
}

export function UpcomingList({ days = 14, limit }: { days?: number; limit?: number }) {
  const { data: upcoming, isLoading } = useUpcoming(days);
  const { data: planned = [] } = usePlanned();
  const lookups = useRecordLookups();
  const skip = useSkipPlanned();
  const [paying, setPaying] = useState<{ plan: PlannedPayment; due: string } | null>(null);
  const byId = new Map(planned.map((p) => [p.id, p]));

  if (isLoading) {
    return (
      <div className="grid gap-3 px-5 pb-5">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  // Only the next open occurrence of each plan can be confirmed – show those first.
  const seen = new Set<string>();
  const items = (upcoming ?? []).filter((o: UpcomingOccurrence) => byId.has(o.plannedPaymentId));
  const visible = limit ? items.slice(0, limit) : items;
  if (!visible.length) {
    return (
      <EmptyState
        title="Nothing due soon"
        description={`No planned payments in the next ${days} days.`}
        className="py-8"
      />
    );
  }
  return (
    <>
      <ul className="grid gap-0.5 px-2 pb-3">
        {visible.map((o) => {
          const p = byId.get(o.plannedPaymentId)!;
          const isNext = !seen.has(p.id);
          seen.add(p.id);
          const { icon, color } = plannedIcon(p, lookups);
          const signed = p.type === 'expense' ? -p.amount : p.amount;
          return (
            <li
              key={`${o.plannedPaymentId}-${o.dueDate}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted/60"
            >
              <IconBadge icon={icon} color={color} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p
                  className={cn(
                    'text-xs',
                    o.overdue ? 'font-medium text-expense' : 'text-muted-foreground',
                  )}
                >
                  {format(parseISO(o.dueDate), 'EEE, d MMM')} · {dueLabel(o.dueDate)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={cn(
                    'tabular text-sm font-semibold',
                    p.type === 'expense'
                      ? 'text-expense'
                      : p.type === 'income'
                        ? 'text-income'
                        : '',
                  )}
                >
                  {money(signed, p.currency, {
                    sign: p.type === 'transfer' ? 'auto' : 'exceptZero',
                  })}
                </span>
                {isNext ? (
                  <span className="flex gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      title="Skip this occurrence"
                      onClick={() =>
                        skip.mutate(p.id, {
                          onSuccess: () => toast.success(`Skipped ${p.name}`),
                          onError: (e) => toast.error(errorMessage(e)),
                        })
                      }
                    >
                      <SkipForward />
                    </Button>
                    <Button
                      size="xs"
                      variant={o.overdue ? 'default' : 'secondary'}
                      onClick={() => setPaying({ plan: p, due: o.dueDate })}
                    >
                      <Check /> Paid
                    </Button>
                  </span>
                ) : (
                  <Badge>later</Badge>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {paying && (
        <PayDialog plan={paying.plan} dueDate={paying.due} onClose={() => setPaying(null)} />
      )}
    </>
  );
}
