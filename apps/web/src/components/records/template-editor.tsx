import {
  minorToInputString,
  parseAmountToMinor,
  type RecordTemplate,
  type TemplateInput,
} from '@dostotinka/shared';
import { type FormEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useAccounts, useCategories, useLabels, useSaveTemplate, useUser } from '@/api/queries';
import { CategoryButton, CategoryPickerPanel } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { t } from '@/i18n';
import { buildCategoryIndex } from '@/lib/categories';
import { cn } from '@/lib/utils';
import { NoteField } from './note-field';
import { PayeeField } from './payee-field';

type Kind = 'expense' | 'income' | 'transfer';

/** Creates or changes a template: everything a template fills in, the amount only if wanted. */
export function TemplateEditor({
  template,
  onClose,
}: {
  template: RecordTemplate | null;
  onClose: () => void;
}) {
  const user = useUser();
  const { data: accounts = [] } = useAccounts();
  const { data: labels = [] } = useLabels();
  const { data: categoryList } = useCategories();
  const categories = useMemo(() => buildCategoryIndex(categoryList), [categoryList]);
  const save = useSaveTemplate();
  const currencyOf = (id: string) => accounts.find((a) => a.id === id)?.currency ?? 'EUR';
  const [form, setForm] = useState(() => ({
    name: template?.name ?? '',
    type: (template?.type ?? 'expense') as Kind,
    accountId: template?.accountId ?? '',
    toAccountId: template?.toAccountId ?? '',
    categoryId: template?.categoryId ?? null,
    payee: template?.payee ?? '',
    note: template?.note ?? '',
    labelIds: template?.labelIds ?? [],
    amount:
      template?.amount != null
        ? minorToInputString(template.amount, currencyOf(template.accountId ?? ''))
        : '',
  }));
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const usable = accounts.filter(
    (a) => !a.archived || a.id === form.accountId || a.id === form.toAccountId,
  );

  const setType = (type: Kind) =>
    setForm((f) => ({
      ...f,
      type,
      // A category of the other kind does not fit; transfers have none.
      categoryId:
        type !== 'transfer' && f.categoryId && categories.byId.get(f.categoryId)?.kind === type
          ? f.categoryId
          : null,
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    const isTransfer = form.type === 'transfer';
    if (isTransfer && form.accountId && form.accountId === form.toAccountId) {
      setError(t('Choose two different accounts'));
      return;
    }
    let amount: number | null = null;
    if (form.amount.trim()) {
      amount = parseAmountToMinor(form.amount, currencyOf(form.accountId));
      if (amount === null || amount <= 0) {
        setError(t('Enter an amount greater than zero'));
        return;
      }
    }
    const input: TemplateInput = {
      name: form.name.trim(),
      type: form.type,
      accountId: form.accountId || null,
      toAccountId: isTransfer ? form.toAccountId || null : null,
      categoryId: isTransfer ? null : form.categoryId,
      payee: isTransfer ? null : form.payee.trim() || null,
      note: form.note.trim() || null,
      labelIds: form.labelIds,
      amount,
    };
    try {
      await save.mutateAsync({ id: template?.id, input });
      toast.success(t('Template saved'));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <DialogContent
      title={picking ? t('Choose category') : template ? t('Edit template') : t('New template')}
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
        <form onSubmit={submit} className="grid grid-cols-1 gap-4">
          <Field label={t('Name')} htmlFor="tpl-name">
            <Input
              id="tpl-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={60}
              required
              autoFocus={!template}
            />
          </Field>
          <Segmented<Kind>
            value={form.type}
            onChange={setType}
            options={[
              { value: 'expense', label: t('Expense') },
              { value: 'income', label: t('Income') },
              { value: 'transfer', label: t('Transfer') },
            ]}
          />
          <div className={cn('grid gap-3', form.type === 'transfer' && 'sm:grid-cols-2')}>
            <Field
              label={form.type === 'transfer' ? t('From') : t('Account')}
              htmlFor="tpl-account"
            >
              <Select
                id="tpl-account"
                value={form.accountId}
                onChange={(e) => set('accountId', e.target.value)}
              >
                <option value="">{t('The account chosen in the editor')}</option>
                {usable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {form.type === 'transfer' && (
              <Field label={t('To')} htmlFor="tpl-to">
                <Select
                  id="tpl-to"
                  value={form.toAccountId}
                  onChange={(e) => set('toAccountId', e.target.value)}
                >
                  <option value="">{t('The account chosen in the editor')}</option>
                  {usable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          {form.type !== 'transfer' && (
            <>
              <Field label={t('Category')}>
                <CategoryButton value={form.categoryId} onClick={() => setPicking(true)} />
              </Field>
              <Field label={form.type === 'income' ? t('Payer') : t('Payee')} htmlFor="tpl-payee">
                <PayeeField
                  id="tpl-payee"
                  value={form.payee}
                  onValueChange={(v) => set('payee', v)}
                  suggest={user.noteSuggestions}
                  placeholder={t('Shop, company or person')}
                  maxLength={120}
                />
              </Field>
            </>
          )}
          <Field label={t('Note')} htmlFor="tpl-note">
            <NoteField
              id="tpl-note"
              value={form.note}
              onValueChange={(v) => set('note', v)}
              suggest={user.noteSuggestions}
              maxLength={500}
              rows={2}
            />
          </Field>
          {labels.length > 0 && (
            <Field label={t('Labels')}>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const active = form.labelIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() =>
                        set(
                          'labelIds',
                          active
                            ? form.labelIds.filter((x) => x !== l.id)
                            : [...form.labelIds, l.id],
                        )
                      }
                      className={cn(
                        'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        active
                          ? 'text-white'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                      style={
                        active ? { backgroundColor: l.color, borderColor: l.color } : undefined
                      }
                    >
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          <Field
            label={t('Amount (optional)')}
            htmlFor="tpl-amount"
            hint={t('Leave empty to type the amount each time.')}
          >
            <Input
              id="tpl-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder={t('Typed in each time')}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-0">
            <Button variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
