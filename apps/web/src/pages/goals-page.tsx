import {
  CURRENCIES,
  type Goal,
  getCurrency,
  minorToInputString,
  parseAmountToMinor,
} from '@slavotax/shared';
import { format, parseISO } from 'date-fns';
import { Flag, Minus, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useContributeGoal,
  useDeleteGoal,
  useGoals,
  useSaveGoal,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/misc';
import { ColorPicker, IconPicker } from '@/components/ui/pickers';
import { money, percent } from '@/lib/format';

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const user = useUser();
  const { data: accounts = [] } = useAccounts();
  const save = useSaveGoal();
  const [name, setName] = useState(goal?.name ?? '');
  const [currency, setCurrency] = useState(goal?.currency ?? user.baseCurrency);
  const [target, setTarget] = useState(
    goal ? minorToInputString(goal.targetAmount, goal.currency) : '',
  );
  const [saved, setSaved] = useState(
    goal ? minorToInputString(goal.savedAmount, goal.currency) : '',
  );
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [source, setSource] = useState<'manual' | 'account'>(
    goal?.accountId ? 'account' : 'manual',
  );
  const [accountId, setAccountId] = useState(
    goal?.accountId ?? accounts.find((a) => a.type === 'savings')?.id ?? accounts[0]?.id ?? '',
  );
  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId(accounts.find((a) => a.type === 'savings')?.id ?? accounts[0]!.id);
    }
  }, [accountId, accounts]);
  const [color, setColor] = useState(goal?.color ?? '#10B981');
  const [icon, setIcon] = useState(goal?.icon ?? 'piggy-bank');
  const [note, setNote] = useState(goal?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const targetAmount = parseAmountToMinor(target, currency);
    if (!targetAmount || targetAmount <= 0) {
      setError('Enter the amount you want to save');
      return;
    }
    const savedAmount = saved.trim() ? parseAmountToMinor(saved, currency) : 0;
    if (savedAmount === null) {
      setError('The saved amount is not a valid number');
      return;
    }
    try {
      await save.mutateAsync({
        id: goal?.id,
        input: {
          name,
          currency,
          targetAmount,
          savedAmount,
          targetDate: date || null,
          accountId: source === 'account' ? accountId || null : null,
          color,
          icon,
          note: note || null,
        },
      });
      toast.success(goal ? 'Goal updated' : 'Goal created');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={goal ? 'Edit goal' : 'New savings goal'} size="md">
        <form onSubmit={submit} className="grid gap-4">
          <div className="flex items-end gap-3">
            <IconBadge icon={icon} color={color} size="lg" />
            <Field label="Name" htmlFor="goal-name" className="flex-1">
              <Input
                id="goal-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer vacation"
                required
                maxLength={60}
                autoFocus
              />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Target amount" htmlFor="goal-target">
              <Input
                id="goal-target"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0.00"
                required
              />
            </Field>
            <Field label="Currency" htmlFor="goal-cur">
              <Select
                id="goal-cur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                containerClassName="w-28"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Target date (optional)"
            htmlFor="goal-date"
            hint="Slavotax tells you how much to put aside every month."
          >
            <Input
              id="goal-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Track progress">
            <Segmented<'manual' | 'account'>
              value={source}
              onChange={setSource}
              className="w-full"
              options={[
                { value: 'manual', label: 'Manually' },
                { value: 'account', label: 'Balance of an account' },
              ]}
            />
          </Field>
          {source === 'manual' ? (
            <Field label={`Already saved (${getCurrency(currency).code})`} htmlFor="goal-saved">
              <Input
                id="goal-saved"
                inputMode="decimal"
                value={saved}
                onChange={(e) => setSaved(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          ) : (
            <Field
              label="Account"
              htmlFor="goal-acc"
              hint="The goal follows the current balance of this account."
            >
              <Select
                id="goal-acc"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {money(a.balance, a.currency)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Icon">
            <IconPicker value={icon} onChange={setIcon} color={color} />
          </Field>
          <Field label="Colour">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <Field label="Note" htmlFor="goal-note">
            <Textarea
              id="goal-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {goal ? 'Save changes' : 'Create goal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContributeDialog({
  goal,
  direction,
  onClose,
}: {
  goal: Goal;
  direction: 1 | -1;
  onClose: () => void;
}) {
  const contribute = useContributeGoal();
  const [value, setValue] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={direction === 1 ? `Add to “${goal.name}”` : `Take from “${goal.name}”`}
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const minor = parseAmountToMinor(value, goal.currency);
            if (!minor || minor <= 0) return;
            try {
              const res = await contribute.mutateAsync({ id: goal.id, amount: direction * minor });
              toast.success(res.progress >= 1 ? 'Goal reached – congratulations! 🎉' : 'Saved');
              onClose();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <Field label={`Amount (${goal.currency})`} htmlFor="contrib">
            <Input
              id="contrib"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </Field>
          <DialogFooter className="mt-0">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={contribute.isPending}>
              {direction === 1 ? 'Add' : 'Take out'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalCard({
  goal,
  onEdit,
  onContribute,
}: {
  goal: Goal;
  onEdit: () => void;
  onContribute: (d: 1 | -1) => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const remove = useDeleteGoal();
  const confirm = useConfirm();
  const account = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : undefined;
  const reached = goal.progress >= 1;
  const pct = Math.min(1, Math.max(0, goal.progress));
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <IconBadge icon={goal.icon} color={goal.color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{goal.name}</p>
          <p className="text-xs text-muted-foreground">
            {goal.targetDate
              ? `by ${format(parseISO(goal.targetDate), 'd MMMM yyyy')}`
              : 'No deadline'}
            {account && ` · ${account.name}`}
          </p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Actions">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Pencil />} onSelect={onEdit}>
              Edit
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 />}
              destructive
              onSelect={async () => {
                if (
                  await confirm({
                    title: `Delete “${goal.name}”?`,
                    confirmLabel: 'Delete',
                    destructive: true,
                  })
                ) {
                  remove.mutate(goal.id);
                }
              }}
            >
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-2">
        <span className="tabular text-2xl font-semibold">
          {money(goal.currentAmount, goal.currency)}
        </span>
        <span className="tabular text-sm text-muted-foreground">
          of {money(goal.targetAmount, goal.currency)}
        </span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${pct * 100}%`, backgroundColor: goal.color }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{percent(pct)}</span>
        {reached ? (
          <Badge tone="success">Goal reached 🎉</Badge>
        ) : (
          <span>
            {money(Math.max(0, goal.targetAmount - goal.currentAmount), goal.currency)} to go
          </span>
        )}
      </div>
      {!reached && goal.monthlyNeeded !== null && (
        <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
          Save{' '}
          <span className="tabular font-semibold">{money(goal.monthlyNeeded, goal.currency)}</span>{' '}
          per month to reach it on time.
        </p>
      )}
      {goal.note && <p className="mt-3 text-sm text-muted-foreground">{goal.note}</p>}
      {!goal.accountId && (
        <div className="mt-auto flex gap-2 pt-4">
          <Button size="sm" className="flex-1" onClick={() => onContribute(1)}>
            <Plus /> Add money
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onContribute(-1)}
            aria-label="Take money out"
          >
            <Minus />
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function GoalsPage() {
  const { data: goals, isLoading } = useGoals();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [contributing, setContributing] = useState<{ goal: Goal; direction: 1 | -1 } | null>(null);

  return (
    <div>
      <PageHeader
        title="Savings goals"
        description="Save up for the things that matter – a holiday, a new laptop or an emergency fund."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New goal
          </Button>
        }
      />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      ) : !goals?.length ? (
        <Card>
          <EmptyState
            icon={<Flag />}
            title="No goals yet"
            description="Create a goal and see how much you need to put aside every month."
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus /> New goal
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={() => setEditing(g)}
              onContribute={(direction) => setContributing({ goal: g, direction })}
            />
          ))}
        </div>
      )}
      {editing && (
        <GoalForm goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {contributing && (
        <ContributeDialog
          goal={contributing.goal}
          direction={contributing.direction}
          onClose={() => setContributing(null)}
        />
      )}
    </div>
  );
}
