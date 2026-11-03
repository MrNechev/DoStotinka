import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  type Account,
  type AccountType,
  CURRENCIES,
  minorToInputString,
  parseAmountToMinor,
} from '@slavotax/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAdjustBalance as useAdjustBalanceMutation,
  useSaveAccount,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { ColorPicker, IconPicker } from '@/components/ui/pickers';
import { ACCOUNT_TYPE_ICONS } from './account-card';

export function AccountFormDialog({
  account,
  onClose,
}: {
  account?: Account;
  onClose: () => void;
}) {
  const user = useUser();
  const save = useSaveAccount();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking');
  const [currency, setCurrency] = useState(account?.currency ?? user.baseCurrency);
  const [initial, setInitial] = useState(
    account ? minorToInputString(account.initialBalance, account.currency) : '',
  );
  const [color, setColor] = useState(account?.color ?? '#3B82F6');
  const [icon, setIcon] = useState<string | null>(account?.icon ?? null);
  const [showIcons, setShowIcons] = useState(false);
  const [excludeFromStats, setExclude] = useState(account?.excludeFromStats ?? false);
  const [archived, setArchived] = useState(account?.archived ?? false);
  const [note, setNote] = useState(account?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const effectiveIcon = icon ?? ACCOUNT_TYPE_ICONS[type] ?? 'wallet';
  const currencyLocked = !!account && account.recordCount > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const initialBalance = initial.trim() ? parseAmountToMinor(initial, currency) : 0;
    if (initialBalance === null) {
      setError('The starting balance is not a valid number');
      return;
    }
    try {
      await save.mutateAsync({
        id: account?.id,
        input: {
          name,
          type,
          currency,
          initialBalance,
          color,
          icon,
          excludeFromStats,
          archived,
          note: note || null,
        },
      });
      toast.success(account ? 'Account updated' : 'Account created');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={account ? 'Edit account' : 'New account'} size="md">
        <form onSubmit={submit} className="grid gap-4">
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={() => setShowIcons((v) => !v)}
              className="cursor-pointer rounded-full"
              title="Change icon"
            >
              <IconBadge icon={effectiveIcon} color={color} size="lg" />
            </button>
            <Field label="Name" htmlFor="acc-name" className="flex-1">
              <Input
                id="acc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cash, Main bank account"
                required
                maxLength={60}
                autoFocus
              />
            </Field>
          </div>
          {showIcons && <IconPicker value={effectiveIcon} onChange={setIcon} color={color} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="acc-type">
              <Select
                id="acc-type"
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Currency"
              htmlFor="acc-currency"
              hint={currencyLocked ? 'Cannot be changed once the account has records.' : undefined}
            >
              <Select
                id="acc-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={currencyLocked}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} – {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Starting balance"
            htmlFor="acc-initial"
            hint={
              account
                ? 'The balance before your first record. To fix the current balance use “Adjust balance”.'
                : 'How much money is in this account right now.'
            }
          >
            <Input
              id="acc-initial"
              inputMode="decimal"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Colour">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <Field label="Note" htmlFor="acc-note">
            <Textarea
              id="acc-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </Field>
          <div className="grid gap-3 rounded-xl border border-border p-3">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">Exclude from statistics</span>
                <span className="block text-xs text-muted-foreground">
                  Not counted in “All accounts” totals and charts.
                </span>
              </span>
              <Switch checked={excludeFromStats} onCheckedChange={setExclude} />
            </label>
            {account && (
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-medium">Archived</span>
                  <span className="block text-xs text-muted-foreground">
                    Hidden from lists – the history stays in your statistics.
                  </span>
                </span>
                <Switch checked={archived} onCheckedChange={setArchived} />
              </label>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {account ? 'Save changes' : 'Create account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustBalanceDialog({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const [value, setValue] = useState(minorToInputString(account.balance, account.currency));
  const [createRecord, setCreateRecord] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adjust = useAdjustBalanceMutation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const balance = parseAmountToMinor(value, account.currency);
    if (balance === null) {
      setError('Enter a valid amount');
      return;
    }
    try {
      await adjust.mutateAsync({ id: account.id, balance, createRecord });
      toast.success('Balance updated');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title="Adjust balance"
        description={`Set the real current balance of “${account.name}”.`}
      >
        <form onSubmit={submit} className="grid gap-4">
          <Field label={`Current balance (${account.currency})`} htmlFor="adj">
            <Input
              id="adj"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </Field>
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <span className="block text-sm font-medium">Record the difference</span>
              <span className="block text-xs text-muted-foreground">
                Creates a correction record (counts in statistics). Otherwise the starting balance
                is changed silently.
              </span>
            </span>
            <Switch checked={createRecord} onCheckedChange={setCreateRecord} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={adjust.isPending}>
              Update balance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
