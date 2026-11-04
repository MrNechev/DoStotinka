import {
  FREQUENCIES,
  type Frequency,
  getCurrency,
  minorToInputString,
  type PlannedPayment,
  parseAmountToMinor,
  type RecordType,
} from '@slavotax/shared';
import { Minus, Plus, Repeat } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useAccounts, useSavePlanned } from '@/api/queries';
import { CategoryButton, CategoryPickerPanel } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Segmented, Switch } from '@/components/ui/misc';
import { t } from '@/i18n';
import { fmt } from '@/lib/date';
import { recurrenceLabel } from '@/lib/format';

const FREQ_LABELS: Record<Frequency, string> = {
  once: t('Once'),
  daily: t('Daily'),
  weekly: t('Weekly'),
  monthly: t('Monthly'),
  yearly: t('Yearly'),
};
const UNIT: Record<Frequency, string> = {
  once: '',
  daily: 'day(s)',
  weekly: 'week(s)',
  monthly: 'month(s)',
  yearly: 'year(s)',
};

export function PlannedFormDialog({
  plan,
  onClose,
}: {
  plan?: PlannedPayment;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const save = useSavePlanned();
  const active = accounts.filter(
    (a) => !a.archived || a.id === plan?.accountId || a.id === plan?.toAccountId,
  );
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    type: (plan?.type ?? 'expense') as RecordType,
    amount: plan ? minorToInputString(plan.amount, plan.currency) : '',
    accountId: plan?.accountId ?? active[0]?.id ?? '',
    toAccountId: plan?.toAccountId ?? '',
    categoryId: plan?.categoryId ?? null,
    frequency: (plan?.frequency ?? 'monthly') as Frequency,
    interval: String(plan?.interval ?? 1),
    startDate: plan?.startDate ?? fmt(new Date(), 'yyyy-MM-dd'),
    endDate: plan?.endDate ?? '',
    payee: plan?.payee ?? '',
    note: plan?.note ?? '',
    autoConfirm: plan?.autoConfirm ?? false,
  });
  const [picking, setPicking] = useState(false);
  // Accounts may still be loading when the dialog opens.
  useEffect(() => {
    if (!form.accountId && active[0]) setForm((f) => ({ ...f, accountId: active[0]!.id }));
  }, [form.accountId, active]);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const account = accounts.find((a) => a.id === form.accountId);
  const currency = account?.currency ?? 'EUR';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amount = parseAmountToMinor(form.amount, currency);
    if (!amount || amount <= 0) {
      setError(t('Enter an amount greater than zero'));
      return;
    }
    try {
      await save.mutateAsync({
        id: plan?.id,
        input: {
          name: form.name,
          type: form.type,
          amount,
          accountId: form.accountId,
          toAccountId: form.type === 'transfer' ? form.toAccountId || null : null,
          categoryId: form.type === 'transfer' ? null : form.categoryId,
          frequency: form.frequency,
          interval: Math.max(1, Number(form.interval) || 1),
          startDate: form.startDate,
          endDate: form.frequency === 'once' ? null : form.endDate || null,
          payee: form.payee || null,
          note: form.note || null,
          autoConfirm: form.autoConfirm,
        },
      });
      toast.success(plan ? t('Planned payment updated') : t('Planned payment created'));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={
          picking
            ? t('Choose category')
            : plan
              ? t('Edit planned payment')
              : t('New planned payment')
        }
        size="md"
      >
        {picking ? (
          <CategoryPickerPanel
            kind={form.type === 'income' ? 'income' : 'expense'}
            value={form.categoryId}
            onBack={() => setPicking(false)}
            onSelect={(id) => {
              set('categoryId', id);
              setPicking(false);
            }}
          />
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <Segmented<RecordType>
              value={form.type}
              onChange={(v) => set('type', v)}
              className="w-full"
              options={[
                {
                  value: 'expense',
                  label: (
                    <>
                      <Minus /> Expense
                    </>
                  ),
                  className: 'text-expense',
                },
                {
                  value: 'income',
                  label: (
                    <>
                      <Plus /> Income
                    </>
                  ),
                  className: 'text-income',
                },
                {
                  value: 'transfer',
                  label: (
                    <>
                      <Repeat /> Transfer
                    </>
                  ),
                },
              ]}
            />
            <Field label={t('Name')} htmlFor="pp-name">
              <Input
                id="pp-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder={t('e.g. Rent, Electricity, Car insurance')}
                required
                maxLength={80}
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('Amount ({currency})', { currency: getCurrency(currency).code })}
                htmlFor="pp-amount"
              >
                <Input
                  id="pp-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  placeholder="0.00"
                  required
                />
              </Field>
              <Field
                label={form.type === 'transfer' ? t('From account') : t('Account')}
                htmlFor="pp-account"
              >
                <Select
                  id="pp-account"
                  value={form.accountId}
                  onChange={(e) => set('accountId', e.target.value)}
                >
                  {active.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {form.type === 'transfer' ? (
              <Field label={t('To account')} htmlFor="pp-to">
                <Select
                  id="pp-to"
                  value={form.toAccountId}
                  onChange={(e) => set('toAccountId', e.target.value)}
                  required
                >
                  <option value="">{t('Choose account…')}</option>
                  {active
                    .filter((a) => a.id !== form.accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : (
              <Field label={t('Category')}>
                <CategoryButton value={form.categoryId} onClick={() => setPicking(true)} />
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Repeats')} htmlFor="pp-freq">
                <Select
                  id="pp-freq"
                  value={form.frequency}
                  onChange={(e) => set('frequency', e.target.value as Frequency)}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {FREQ_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </Field>
              {form.frequency !== 'once' && (
                <Field
                  label={t('Every')}
                  htmlFor="pp-int"
                  hint={recurrenceLabel({
                    frequency: form.frequency,
                    interval: Number(form.interval) || 1,
                  })}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      id="pp-int"
                      type="number"
                      min={1}
                      max={366}
                      value={form.interval}
                      onChange={(e) => set('interval', e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">{UNIT[form.frequency]}</span>
                  </div>
                </Field>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={form.frequency === 'once' ? t('Due date') : t('First due date')}
                htmlFor="pp-start"
              >
                <Input
                  id="pp-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                  required
                />
              </Field>
              {form.frequency !== 'once' && (
                <Field label={t('Ends (optional)')} htmlFor="pp-end">
                  <Input
                    id="pp-end"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => set('endDate', e.target.value)}
                    min={form.startDate}
                  />
                </Field>
              )}
            </div>
            {form.type !== 'transfer' && (
              <Field label={form.type === 'income' ? t('Payer') : t('Payee')} htmlFor="pp-payee">
                <Input
                  id="pp-payee"
                  value={form.payee}
                  onChange={(e) => set('payee', e.target.value)}
                  maxLength={120}
                />
              </Field>
            )}
            <Field label={t('Note')} htmlFor="pp-note">
              <Textarea
                id="pp-note"
                rows={2}
                value={form.note}
                onChange={(e) => set('note', e.target.value)}
                maxLength={500}
              />
            </Field>
            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">{t('Record automatically')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    'Creates the record on the due date without asking – ideal for subscriptions and salary.',
                  )}
                </span>
              </span>
              <Switch checked={form.autoConfirm} onCheckedChange={(v) => set('autoConfirm', v)} />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="mt-1">
              <Button variant="outline" onClick={onClose}>
                {t('Cancel')}
              </Button>
              <Button type="submit" loading={save.isPending}>
                {plan ? t('Save changes') : t('Create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
