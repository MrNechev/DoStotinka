import { minorToInputString, type PlannedPayment, parseAmountToMinor } from '@slavotax/shared';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useAccounts, usePayPlanned } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { longDate } from '@/lib/format';

/** Confirms a planned payment occurrence – creates the real record. */
export function PayDialog({
  plan,
  dueDate,
  onClose,
}: {
  plan: PlannedPayment;
  dueDate: string;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const pay = usePayPlanned();
  const [amount, setAmount] = useState(minorToInputString(plan.amount, plan.currency));
  const [accountId, setAccountId] = useState(plan.accountId);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [error, setError] = useState<string | null>(null);
  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? plan.currency;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = parseAmountToMinor(amount, currency);
    if (!minor || minor <= 0) {
      setError('Enter a valid amount');
      return;
    }
    const now = new Date();
    const occurredAt = new Date(`${date}T${format(now, 'HH:mm')}`);
    try {
      await pay.mutateAsync({
        id: plan.id,
        dueDate,
        amount: minor,
        accountId,
        occurredAt: occurredAt.toISOString(),
      });
      toast.success(`${plan.name} marked as paid`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={`Confirm “${plan.name}”`}
        description={`Due on ${longDate(dueDate)}. A record will be created in your account.`}
      >
        <form onSubmit={submit} className="grid gap-4">
          <Field label={`Amount (${currency})`} htmlFor="pay-amount">
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field
            label={plan.type === 'transfer' ? 'From account' : 'Account'}
            htmlFor="pay-account"
          >
            <Select
              id="pay-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts
                .filter((a) => !a.archived || a.id === accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Paid on" htmlFor="pay-date">
            <Input
              id="pay-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pay.isPending}>
              Mark as paid
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
