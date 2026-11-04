import {
  CURRENCIES,
  convertMinor,
  type Debt,
  type DebtDirection,
  minorToInputString,
  parseAmountToMinor,
} from '@slavotax/shared';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Handshake,
  List,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useCreateDebt,
  useCurrencies,
  useDebtMovement,
  useDebts,
  useDeleteDebt,
  useUpdateDebt,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/misc';
import { t } from '@/i18n';
import { fmt } from '@/lib/date';
import { longDate, money, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const today = () => fmt(new Date(), 'yyyy-MM-dd');

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
  ) : null;
}

/** New debt: who, how much, and (optionally) the account the money went through. */
function DebtForm({ onClose, people }: { onClose: () => void; people: string[] }) {
  const user = useUser();
  const { data: accounts = [] } = useAccounts();
  const active = accounts.filter((a) => !a.archived);
  const create = useCreateDebt();
  const [direction, setDirection] = useState<DebtDirection>('lent');
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(active[0]?.id ?? '');
  const [currency, setCurrency] = useState(user.baseCurrency);
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!accountId && active.length) setAccountId(active[0]!.id);
  }, [accountId, active]);
  const account = accounts.find((a) => a.id === accountId);
  const amountCurrency = account?.currency ?? currency;

  return (
    <DialogContent size="md" title={t('New debt')}>
      <form
        className="grid grid-cols-1 gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const minor = parseAmountToMinor(amount, amountCurrency);
          if (!minor || minor <= 0) {
            setError(t('Enter an amount greater than zero'));
            return;
          }
          try {
            await create.mutateAsync({
              direction,
              person,
              amount: minor,
              date,
              accountId: accountId || null,
              currency: accountId ? undefined : currency,
              dueDate: dueDate || null,
              note: note || null,
            });
            toast.success(t('Debt saved'));
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <Segmented<DebtDirection>
          value={direction}
          onChange={setDirection}
          className="w-full"
          options={[
            {
              value: 'lent',
              label: (
                <>
                  <ArrowUpRight /> {t('I lent money')}
                </>
              ),
            },
            {
              value: 'borrowed',
              label: (
                <>
                  <ArrowDownLeft /> {t('I borrowed money')}
                </>
              ),
            },
          ]}
        />
        <Field
          label={direction === 'lent' ? t('Who owes you?') : t('Whom do you owe?')}
          htmlFor="debt-person"
        >
          <Input
            id="debt-person"
            list="debt-people"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            maxLength={80}
            required
            autoFocus
          />
          <datalist id="debt-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label={t('Amount')} htmlFor="debt-amount">
            <Input
              id="debt-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          {accountId ? (
            <span className="pb-2.5 text-sm font-medium text-muted-foreground">
              {amountCurrency}
            </span>
          ) : (
            <Select
              aria-label={t('Currency')}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          )}
        </div>
        <Field
          label={direction === 'lent' ? t('Paid from account') : t('Received in account')}
          htmlFor="debt-account"
          hint={
            accountId
              ? t('A record moves the money; it does not count as income or expense.')
              : t('Only the amount owed is tracked – no account balance changes.')
          }
        >
          <Select
            id="debt-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {money(a.balance, a.currency)}
              </option>
            ))}
            <option value="">{t('No account (owed from before)')}</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Date')} htmlFor="debt-date">
            <Input
              id="debt-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <Field label={t('Due date (optional)')} htmlFor="debt-due">
            <Input
              id="debt-due"
              type="date"
              value={dueDate}
              min={date}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t('Note')} htmlFor="debt-note">
          <Textarea
            id="debt-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </Field>
        <ErrorText error={error} />
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={create.isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditDebtForm({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const update = useUpdateDebt();
  const [person, setPerson] = useState(debt.person);
  const [dueDate, setDueDate] = useState(debt.dueDate ?? '');
  const [note, setNote] = useState(debt.note ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogContent size="sm" title={t('Edit debt')}>
      <form
        className="grid grid-cols-1 gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await update.mutateAsync({
              id: debt.id,
              input: { person, dueDate: dueDate || null, note: note || null },
            });
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <Field label={t('Name')} htmlFor="edit-debt-person">
          <Input
            id="edit-debt-person"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            maxLength={80}
            required
          />
        </Field>
        <Field label={t('Due date (optional)')} htmlFor="edit-debt-due">
          <Input
            id="edit-debt-due"
            type="date"
            value={dueDate}
            min={debt.date}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
        <Field label={t('Note')} htmlFor="edit-debt-note">
          <Textarea
            id="edit-debt-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </Field>
        <ErrorText error={error} />
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={update.isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

type MovementKind = 'repayment' | 'increase';

function movementTitle(debt: Debt, kind: MovementKind) {
  if (debt.direction === 'lent') {
    return kind === 'repayment'
      ? t('{name} paid you back', { name: debt.person })
      : t('Lend {name} more', { name: debt.person });
  }
  return kind === 'repayment'
    ? t('Pay {name} back', { name: debt.person })
    : t('Borrow more from {name}', { name: debt.person });
}

function MovementForm({
  debt,
  kind,
  onClose,
}: {
  debt: Debt;
  kind: MovementKind;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: currencies } = useCurrencies();
  const active = accounts.filter((a) => !a.archived);
  const move = useDebtMovement();
  const [accountId, setAccountId] = useState(
    active.find((a) => a.currency === debt.currency)?.id ?? active[0]?.id ?? '',
  );
  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? debt.currency;
  // Suggest the whole outstanding amount for a repayment (converted to the account currency).
  const suggestion = useMemo(() => {
    if (kind !== 'repayment' || !debt.outstanding) return '';
    if (currency === debt.currency) return minorToInputString(debt.outstanding, currency);
    if (!currencies) return '';
    const rates: Record<string, number> = { [currencies.baseCurrency]: 1 };
    for (const r of currencies.rates) rates[r.currency] = r.rate;
    if (!(currency in rates) || !(debt.currency in rates)) return '';
    return minorToInputString(
      convertMinor(debt.outstanding, debt.currency, currency, rates),
      currency,
    );
  }, [kind, debt, currency, currencies]);
  const [amount, setAmount] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const value = amount ?? suggestion;
  return (
    <DialogContent size="sm" title={movementTitle(debt, kind)}>
      <form
        className="grid grid-cols-1 gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const minor = parseAmountToMinor(value, currency);
          if (!minor || minor <= 0) {
            setError(t('Enter an amount greater than zero'));
            return;
          }
          if (!accountId) {
            setError(t('Choose an account'));
            return;
          }
          const now = new Date();
          const occurredAt = new Date(`${date}T${fmt(now, 'HH:mm')}`);
          try {
            const res = await move.mutateAsync({
              id: debt.id,
              input: {
                kind,
                amount: minor,
                accountId,
                occurredAt: occurredAt.toISOString(),
                note: note || null,
              },
            });
            toast.success(res.closedAt ? t('Debt settled 🎉') : t('Saved'));
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <Field label={t('Amount ({currency})', { currency })} htmlFor="move-amount">
          <Input
            id="move-amount"
            inputMode="decimal"
            value={value}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field
          label={
            (debt.direction === 'lent') === (kind === 'repayment')
              ? t('Received in account')
              : t('Paid from account')
          }
          htmlFor="move-account"
        >
          <Select
            id="move-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {money(a.balance, a.currency)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('Date')} htmlFor="move-date">
          <Input
            id="move-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        <Field label={t('Note')} htmlFor="move-note">
          <Input
            id="move-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </Field>
        <ErrorText error={error} />
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={move.isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function dueInfo(debt: Debt): { label: string; overdue: boolean } | null {
  if (!debt.dueDate || debt.closedAt) return null;
  const days = differenceInCalendarDays(parseISO(debt.dueDate), new Date());
  if (days < 0)
    return { label: t('Overdue since {date}', { date: shortDate(debt.dueDate) }), overdue: true };
  if (days === 0) return { label: t('Due today'), overdue: true };
  return { label: t('Due {date}', { date: shortDate(debt.dueDate) }), overdue: false };
}

function DebtCard({
  debt,
  onEdit,
  onMove,
}: {
  debt: Debt;
  onEdit: () => void;
  onMove: (kind: MovementKind) => void;
}) {
  const update = useUpdateDebt();
  const remove = useDeleteDebt();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const lent = debt.direction === 'lent';
  const ratio = debt.total > 0 ? Math.min(1, debt.repaid / debt.total) : 0;
  const due = dueInfo(debt);
  const closed = !!debt.closedAt;
  const color = lent ? 'var(--income)' : 'var(--expense)';
  return (
    <Card className={cn('flex flex-col p-5', closed && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {debt.person.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{debt.person}</p>
          <p className="text-xs text-muted-foreground">
            {lent
              ? t('Lent on {date}', { date: longDate(debt.date) })
              : t('Borrowed on {date}', { date: longDate(debt.date) })}
          </p>
        </div>
        {closed ? (
          <Badge tone="success">{t('settled')}</Badge>
        ) : due ? (
          <Badge tone={due.overdue ? 'danger' : 'neutral'}>{due.label}</Badge>
        ) : null}
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('Actions')}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Plus />} onSelect={() => onMove('increase')}>
              {lent ? t('Lend more') : t('Borrow more')}
            </MenuItem>
            <MenuItem icon={<Pencil />} onSelect={onEdit}>
              {t('Edit')}
            </MenuItem>
            {debt.recordCount > 0 && (
              <MenuItem icon={<List />} onSelect={() => navigate(`/records?debt=${debt.id}`)}>
                {t('Show records')}
              </MenuItem>
            )}
            <MenuItem
              icon={closed ? <LockOpen /> : <Lock />}
              onSelect={() =>
                update.mutate(
                  { id: debt.id, input: { closed: !closed } },
                  { onError: (err) => toast.error(errorMessage(err)) },
                )
              }
            >
              {closed ? t('Reopen') : t('Mark as settled')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 />}
              destructive
              onSelect={async () => {
                const ok = await confirm({
                  title: t('Delete the debt with {name}?', { name: debt.person }),
                  description:
                    debt.recordCount > 0
                      ? t(
                          'Its {n} records are deleted too, so account balances change back. To keep them, mark the debt as settled instead.',
                          { n: debt.recordCount },
                        )
                      : t('This cannot be undone.'),
                  confirmLabel: t('Delete'),
                  destructive: true,
                });
                if (ok)
                  remove.mutate(debt.id, { onError: (err) => toast.error(errorMessage(err)) });
              }}
            >
              {t('Delete')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span className="tabular text-2xl font-semibold">
          {money(debt.outstanding, debt.currency)}
        </span>
        <span className="tabular text-sm text-muted-foreground">
          {t('of {amount}', { amount: money(debt.total, debt.currency) })}
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label={t('Paid back')}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${ratio * 100}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t('{amount} paid back', { amount: money(debt.repaid, debt.currency) })}
      </p>
      {debt.note && <p className="mt-3 text-sm text-muted-foreground">{debt.note}</p>}
      {!closed && (
        <div className="mt-auto pt-4">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => onMove('repayment')}
          >
            {lent ? t('Record a repayment') : t('Pay back')}
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function DebtsPage() {
  const user = useUser();
  const { data: debts, isLoading } = useDebts();
  const { data: currencies } = useCurrencies();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [moving, setMoving] = useState<{ debt: Debt; kind: MovementKind } | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const open = (debts ?? []).filter((d) => !d.closedAt);
  const closed = (debts ?? []).filter((d) => d.closedAt);
  const people = [...new Set((debts ?? []).map((d) => d.person))].sort();
  const total = (direction: DebtDirection) => {
    const rates: Record<string, number> = { [user.baseCurrency]: 1 };
    for (const r of currencies?.rates ?? []) rates[r.currency] = r.rate;
    return open
      .filter((d) => d.direction === direction)
      .reduce(
        (sum, d) => sum + convertMinor(d.outstanding, d.currency, user.baseCurrency, rates),
        0,
      );
  };

  const grid = (list: Debt[]) => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.map((d) => (
        <DebtCard
          key={d.id}
          debt={d}
          onEdit={() => setEditing(d)}
          onMove={(kind) => setMoving({ debt: d, kind })}
        />
      ))}
    </div>
  );
  const owedToMe = open.filter((d) => d.direction === 'lent');
  const iOwe = open.filter((d) => d.direction === 'borrowed');

  return (
    <div>
      <PageHeader
        title={t('Debts')}
        description={t('Money you lent to others or borrowed from them – and what is still open.')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t('New debt')}
          </Button>
        }
      />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : !debts?.length ? (
        <Card>
          <EmptyState
            icon={<Handshake />}
            title={t('No debts')}
            description={t(
              'Keep track of money you lend to friends or borrow from family – and of every repayment.',
            )}
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus /> {t('New debt')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">{t('Owed to me')}</p>
              <p className="tabular mt-1 text-2xl font-semibold text-income">
                {money(total('lent'), user.baseCurrency)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">{t('I owe')}</p>
              <p className="tabular mt-1 text-2xl font-semibold text-expense">
                {money(total('borrowed'), user.baseCurrency)}
              </p>
            </Card>
          </div>
          {owedToMe.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                {t('Owed to me')}
              </h2>
              {grid(owedToMe)}
            </section>
          )}
          {iOwe.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('I owe')}</h2>
              {grid(iOwe)}
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <button
                type="button"
                className="mb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setShowClosed((v) => !v)}
                aria-expanded={showClosed}
              >
                {showClosed
                  ? t('Hide settled debts ({n})', { n: closed.length })
                  : t('Show settled debts ({n})', { n: closed.length })}
              </button>
              {showClosed && grid(closed)}
            </section>
          )}
        </div>
      )}
      <Dialog
        open={creating || !!editing || !!moving}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
            setMoving(null);
          }
        }}
      >
        {creating && <DebtForm people={people} onClose={() => setCreating(false)} />}
        {editing && <EditDebtForm debt={editing} onClose={() => setEditing(null)} />}
        {moving && (
          <MovementForm debt={moving.debt} kind={moving.kind} onClose={() => setMoving(null)} />
        )}
      </Dialog>
    </div>
  );
}
