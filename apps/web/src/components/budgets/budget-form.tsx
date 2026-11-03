import {
  type Budget,
  type BudgetPeriod,
  minorToInputString,
  parseAmountToMinor,
} from '@slavotax/shared';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useAccounts, useCategories, useSaveBudget, useUser } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { ColorPicker } from '@/components/ui/pickers';
import { buildCategoryIndex } from '@/lib/categories';
import { cn } from '@/lib/utils';

export function BudgetFormDialog({ budget, onClose }: { budget?: Budget; onClose: () => void }) {
  const user = useUser();
  const { data: categories } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const save = useSaveBudget();
  const [name, setName] = useState(budget?.name ?? '');
  const [amount, setAmount] = useState(
    budget ? minorToInputString(budget.amount, budget.currency) : '',
  );
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'month');
  const [categoryIds, setCategoryIds] = useState<string[]>(budget?.categoryIds ?? []);
  const [accountIds, setAccountIds] = useState<string[]>(budget?.accountIds ?? []);
  const [color, setColor] = useState(budget?.color ?? '#22C55E');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = new Set(categoryIds);

  const toggleGroup = (groupId: string) => {
    const children = index.childrenOf(groupId).map((c) => c.id);
    if (selected.has(groupId)) {
      setCategoryIds(categoryIds.filter((id) => id !== groupId));
    } else {
      setCategoryIds([...categoryIds.filter((id) => !children.includes(id)), groupId]);
    }
  };
  const toggleChild = (groupId: string, childId: string) => {
    if (selected.has(groupId)) {
      // Switch from "whole group" to "all subcategories except this one".
      const children = index.childrenOf(groupId).map((c) => c.id);
      setCategoryIds([
        ...categoryIds.filter((id) => id !== groupId),
        ...children.filter((id) => id !== childId),
      ]);
      return;
    }
    setCategoryIds(
      selected.has(childId)
        ? categoryIds.filter((id) => id !== childId)
        : [...categoryIds, childId],
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const minor = parseAmountToMinor(amount, user.baseCurrency);
    if (!minor || minor <= 0) {
      setError('Enter a budget amount greater than zero');
      return;
    }
    try {
      await save.mutateAsync({
        id: budget?.id,
        input: { name, amount: minor, period, categoryIds, accountIds, color },
      });
      toast.success(budget ? 'Budget updated' : 'Budget created');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={budget ? 'Edit budget' : 'New budget'} size="md">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Name" htmlFor="b-name">
            <Input
              id="b-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
              required
              maxLength={60}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Limit (${user.baseCurrency})`} htmlFor="b-amount">
              <Input
                id="b-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </Field>
            <Field label="Period" htmlFor="b-period">
              <Select
                id="b-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Categories"
            hint={
              categoryIds.length
                ? `${categoryIds.length} selected`
                : 'Nothing selected = all expenses count towards this budget.'
            }
          >
            <div className="max-h-64 overflow-y-auto rounded-xl border border-border p-1">
              {index.topLevel('expense').map((g) => {
                const children = index.childrenOf(g.id).filter((c) => !c.archived);
                const someChildren = children.some((c) => selected.has(c.id));
                return (
                  <div key={g.id}>
                    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                      <Checkbox
                        checked={selected.has(g.id) ? true : someChildren ? 'indeterminate' : false}
                        onCheckedChange={() => toggleGroup(g.id)}
                        aria-label={g.name}
                      />
                      <IconBadge icon={g.icon} color={g.color ?? '#64748B'} size="xs" />
                      <button
                        type="button"
                        className="flex flex-1 items-center justify-between text-left text-sm"
                        onClick={() => setExpanded(expanded === g.id ? null : g.id)}
                      >
                        {g.name}
                        <ChevronRight
                          className={cn(
                            'size-4 text-muted-foreground transition-transform',
                            expanded === g.id && 'rotate-90',
                          )}
                        />
                      </button>
                    </div>
                    {expanded === g.id && (
                      <div className="ml-8 grid">
                        {children.map((c) => (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted"
                          >
                            <Checkbox
                              checked={selected.has(g.id) || selected.has(c.id)}
                              onCheckedChange={() => toggleChild(g.id, c.id)}
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
          <Field
            label="Accounts"
            hint={
              accountIds.length
                ? undefined
                : 'Nothing selected = all accounts included in statistics.'
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {accounts
                .filter((a) => !a.archived)
                .map((a) => {
                  const on = accountIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        setAccountIds(
                          on ? accountIds.filter((x) => x !== a.id) : [...accountIds, a.id],
                        )
                      }
                      className={cn(
                        'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                        on
                          ? 'border-primary bg-primary-soft text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
                      {a.name}
                    </button>
                  );
                })}
            </div>
          </Field>
          <Field label="Colour">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {budget ? 'Save changes' : 'Create budget'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
