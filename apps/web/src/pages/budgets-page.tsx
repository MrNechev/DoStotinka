import type { BudgetStatus } from '@slavotax/shared';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useBudgetHistory, useBudgets, useCategories, useDeleteBudget } from '@/api/queries';
import { BudgetFormDialog } from '@/components/budgets/budget-form';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { buildCategoryIndex } from '@/lib/categories';
import { money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';

function periodLabel(b: BudgetStatus) {
  const s = parseISO(b.periodStart);
  if (b.period === 'month') return format(s, 'MMMM yyyy');
  if (b.period === 'year') return format(s, 'yyyy');
  return `${format(s, 'd MMM')} – ${format(parseISO(b.periodEnd), 'd MMM yyyy')}`;
}

function BudgetCard({
  b,
  onEdit,
  onHistory,
}: {
  b: BudgetStatus;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const { data: categories } = useCategories();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const remove = useDeleteBudget();
  const confirm = useConfirm();
  const over = b.ratio > 1;
  const ahead = !over && b.ratio > b.elapsed + 0.1 && b.elapsed < 1;
  const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(b.periodEnd), new Date()) + 1);
  const barColor = over ? 'var(--expense)' : ahead ? 'var(--warning)' : b.color;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{b.name}</p>
          <p className="text-xs text-muted-foreground">{periodLabel(b)}</p>
        </div>
        <div className="flex items-center gap-1">
          {over ? (
            <Badge tone="danger">over budget</Badge>
          ) : ahead ? (
            <Badge tone="warning">spending fast</Badge>
          ) : (
            <Badge tone="success">on track</Badge>
          )}
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Actions">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<History />} onSelect={onHistory}>
                History
              </MenuItem>
              <MenuItem icon={<Pencil />} onSelect={onEdit}>
                Edit
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Trash2 />}
                destructive
                onSelect={async () => {
                  if (
                    !(await confirm({
                      title: `Delete “${b.name}”?`,
                      confirmLabel: 'Delete',
                      destructive: true,
                    }))
                  )
                    return;
                  remove.mutate(b.id, { onError: (e) => toast.error(errorMessage(e)) });
                }}
              >
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span className={cn('tabular text-2xl font-semibold', over && 'text-expense')}>
          {money(b.spent, b.currency)}
        </span>
        <span className="tabular text-sm text-muted-foreground">
          of {money(b.amount, b.currency)}
        </span>
      </div>
      <div className="relative mt-2">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.min(1, b.ratio) * 100}%`, backgroundColor: barColor }}
          />
        </div>
        {b.elapsed > 0 && b.elapsed < 1 && (
          <div
            className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-foreground/50"
            style={{ left: `${b.elapsed * 100}%` }}
            title="Today"
          />
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {over ? (
          <span className="font-medium text-expense">
            Over by {money(-b.remaining, b.currency)}
          </span>
        ) : (
          <>
            <span className="font-medium text-foreground">{money(b.remaining, b.currency)}</span>{' '}
            left · {percent(b.ratio)} used
            {b.elapsed < 1 && daysLeft > 0 && (
              <>
                {' '}
                · {money(Math.floor(b.remaining / daysLeft), b.currency)}/day for {daysLeft} days
              </>
            )}
          </>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {b.categoryIds.length === 0 ? (
          <Badge>All expenses</Badge>
        ) : (
          b.categoryIds.slice(0, 4).map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs text-muted-foreground"
            >
              <IconBadge
                icon={index.iconOf(id)}
                color={index.colorOf(id)}
                size="xs"
                className="size-5 [&>svg]:size-3"
              />
              {index.nameOf(id)}
            </span>
          ))
        )}
        {b.categoryIds.length > 4 && <Badge>+{b.categoryIds.length - 4}</Badge>}
      </div>
    </Card>
  );
}

function HistoryDialog({ budget, onClose }: { budget: BudgetStatus; onClose: () => void }) {
  const { data, isLoading } = useBudgetHistory(budget.id, budget.period === 'year' ? 4 : 8);
  const max = Math.max(budget.amount, ...(data ?? []).map((d) => d.spent)) || 1;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`${budget.name} – history`}
        description={`Limit ${money(budget.amount, budget.currency)} per ${budget.period}`}
        size="lg"
      >
        {isLoading || !data ? (
          <Skeleton className="h-56" />
        ) : (
          <div>
            <div className="relative flex h-56 items-end gap-3 border-b border-border pt-6">
              <div
                className="absolute inset-x-0 border-t border-dashed border-muted-foreground/50"
                style={{ bottom: `${(budget.amount / max) * 100}%` }}
              >
                <span className="absolute -top-5 right-0 text-[11px] text-muted-foreground">
                  limit
                </span>
              </div>
              {data.map((d) => (
                <div
                  key={d.periodStart}
                  className="group relative flex h-full flex-1 flex-col justify-end"
                  title={`${periodLabel(d)}: ${money(d.spent, d.currency)}`}
                >
                  <span className="tabular mb-1 text-center text-[11px] font-medium text-muted-foreground">
                    {money(d.spent, d.currency, { compact: true })}
                  </span>
                  <div
                    className="mx-auto w-full max-w-6 rounded-t"
                    style={{
                      height: `${(d.spent / max) * 100}%`,
                      backgroundColor: d.ratio > 1 ? 'var(--expense)' : budget.color,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-3">
              {data.map((d) => (
                <span
                  key={d.periodStart}
                  className="flex-1 truncate text-center text-[11px] text-muted-foreground"
                >
                  {budget.period === 'month'
                    ? format(parseISO(d.periodStart), "MMM ''yy")
                    : budget.period === 'year'
                      ? d.periodStart.slice(0, 4)
                      : format(parseISO(d.periodStart), 'd MMM')}
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Within budget in {data.filter((d) => d.ratio <= 1).length} of {data.length} periods ·
              average{' '}
              {money(
                Math.round(data.reduce((s, d) => s + d.spent, 0) / data.length),
                budget.currency,
              )}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function BudgetsPage() {
  const [offset, setOffset] = useState(0);
  const { data: budgets, isLoading } = useBudgets(offset);
  const [editing, setEditing] = useState<BudgetStatus | 'new' | null>(null);
  const [history, setHistory] = useState<BudgetStatus | null>(null);

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="Set spending limits per week, month or year and see how you are doing."
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setOffset(offset - 1)}
                aria-label="Previous period"
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-28 text-center text-sm font-medium">
                {offset === 0
                  ? 'Current period'
                  : offset === -1
                    ? 'Previous period'
                    : `${-offset} periods ago`}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setOffset(offset + 1)}
                disabled={offset >= 0}
                aria-label="Next period"
              >
                <ChevronRight />
              </Button>
            </div>
            <Button onClick={() => setEditing('new')}>
              <Plus /> New budget
            </Button>
          </>
        }
      />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : !budgets?.length ? (
        <Card>
          <EmptyState
            icon={<Target />}
            title="No budgets yet"
            description="Create a budget, for example 400 € per month for groceries, and track your progress."
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus /> New budget
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {budgets.map((b) => (
            <BudgetCard
              key={b.id}
              b={b}
              onEdit={() => setEditing(b)}
              onHistory={() => setHistory(b)}
            />
          ))}
        </div>
      )}
      {editing && (
        <BudgetFormDialog
          budget={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {history && <HistoryDialog budget={history} onClose={() => setHistory(null)} />}
    </div>
  );
}
