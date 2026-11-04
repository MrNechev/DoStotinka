import {
  type Account,
  CURRENCIES,
  convertMinor,
  getCurrency,
  minorToInputString,
  parseAmountToMinor,
  type RecordInput,
  type RecordItem,
  type RecordTemplate,
  type RecordType,
} from '@dostotinka/shared';
import { ArrowDown, Copy, Handshake, Minus, Plus, Repeat, Trash2 } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useCategories,
  useCurrencies,
  useDebts,
  useDeleteRecord,
  useLabels,
  usePayees,
  useRecordSuggestions,
  useSaveRecord,
  useUploadAttachments,
  useUser,
} from '@/api/queries';
import {
  CategoryButton,
  CategoryPickerPanel,
  rememberCategory,
} from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { t } from '@/i18n';
import { buildCategoryIndex } from '@/lib/categories';
import { fmt } from '@/lib/date';
import { money } from '@/lib/format';
import { cn, storage } from '@/lib/utils';
import { AttachmentsField } from './attachments-field';
import { debtRecordTitle } from './record-list';
import { SaveTemplateButton, TemplateChips } from './templates';

export interface RecordDefaults {
  type?: RecordType;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string | null;
  amount?: number;
  date?: string;
  note?: string;
  payee?: string;
  labelIds?: string[];
  toAmount?: number;
}

interface EditorContextValue {
  openNew: (defaults?: RecordDefaults) => void;
  openEdit: (record: RecordItem) => void;
}

const EditorContext = createContext<EditorContextValue>({ openNew: () => {}, openEdit: () => {} });

export function useRecordEditor() {
  return useContext(EditorContext);
}

const lastAccount = storage<string | null>('last-account', null);

type EditorState =
  | { mode: 'new'; defaults?: RecordDefaults; nonce?: number }
  | { mode: 'edit'; record: RecordItem }
  | null;

export function RecordEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>(null);
  const openNew = useCallback(
    (defaults?: RecordDefaults) => setState({ mode: 'new', defaults }),
    [],
  );
  const openEdit = useCallback((record: RecordItem) => setState({ mode: 'edit', record }), []);
  const value = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit]);
  return (
    <EditorContext.Provider value={value}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
        {state && (
          <RecordEditorDialog
            key={state.mode === 'edit' ? state.record.id : `new-${state.nonce ?? 0}`}
            state={state}
            onClose={() => setState(null)}
            onDuplicate={(defaults) => setState({ mode: 'new', defaults, nonce: Date.now() })}
          />
        )}
      </Dialog>
    </EditorContext.Provider>
  );
}

interface FormState {
  type: RecordType;
  amount: string;
  accountId: string;
  toAccountId: string;
  toAmount: string;
  toAmountTouched: boolean;
  categoryId: string | null;
  date: string;
  time: string;
  note: string;
  payee: string;
  labelIds: string[];
}

function initialState(state: NonNullable<EditorState>, accounts: Account[]): FormState {
  const now = new Date();
  const active = accounts.filter((a) => !a.archived);
  const fallbackAccount =
    (lastAccount.get() && active.find((a) => a.id === lastAccount.get())?.id) ||
    active[0]?.id ||
    '';
  if (state.mode === 'edit') {
    const r = state.record;
    const d = new Date(r.occurredAt);
    const base = {
      date: fmt(d, 'yyyy-MM-dd'),
      time: fmt(d, 'HH:mm'),
      note: r.note ?? '',
      payee: r.payee ?? '',
      labelIds: r.labelIds,
      toAmountTouched: true,
    };
    if (r.type === 'transfer') {
      const incoming = r.amount > 0;
      const fromId = incoming ? (r.counterpartAccountId ?? '') : r.accountId;
      const toId = incoming ? r.accountId : (r.counterpartAccountId ?? '');
      const fromAmount = incoming ? -(r.counterpartAmount ?? -r.amount) : -r.amount;
      const toAmount = incoming ? r.amount : (r.counterpartAmount ?? -r.amount);
      const fromCur = accounts.find((a) => a.id === fromId)?.currency ?? r.currency;
      const toCur = accounts.find((a) => a.id === toId)?.currency ?? r.currency;
      return {
        ...base,
        type: 'transfer',
        amount: minorToInputString(fromAmount, fromCur),
        accountId: fromId,
        toAccountId: toId,
        toAmount: minorToInputString(toAmount, toCur),
        categoryId: null,
      };
    }
    return {
      ...base,
      type: r.type,
      amount: minorToInputString(Math.abs(r.amount), r.currency),
      accountId: r.accountId,
      toAccountId: '',
      toAmount: '',
      categoryId: r.categoryId,
    };
  }
  const d = state.defaults ?? {};
  const accountId = d.accountId ?? fallbackAccount;
  const currency = accounts.find((a) => a.id === accountId)?.currency ?? 'EUR';
  return {
    type: d.type ?? 'expense',
    amount: d.amount ? minorToInputString(d.amount, currency) : '',
    accountId,
    toAccountId: d.toAccountId ?? active.find((a) => a.id !== accountId)?.id ?? '',
    toAmount: d.toAmount
      ? minorToInputString(
          d.toAmount,
          accounts.find((a) => a.id === d.toAccountId)?.currency ?? currency,
        )
      : '',
    toAmountTouched: !!d.toAmount,
    categoryId: d.categoryId ?? null,
    date: d.date ?? fmt(now, 'yyyy-MM-dd'),
    time: fmt(now, 'HH:mm'),
    note: d.note ?? '',
    payee: d.payee ?? '',
    labelIds: d.labelIds ?? [],
  };
}

function RecordEditorDialog({
  state,
  onClose,
  onDuplicate,
}: {
  state: NonNullable<EditorState>;
  onClose: () => void;
  onDuplicate: (defaults: RecordDefaults) => void;
}) {
  const user = useUser();
  const { data: accounts = [] } = useAccounts();
  const { data: labels = [] } = useLabels();
  const { data: payees = [] } = usePayees();
  const { data: suggestions = [] } = useRecordSuggestions();
  const { data: categories } = useCategories();
  const categoryIndex = useMemo(() => buildCategoryIndex(categories), [categories]);
  const { data: currencies } = useCurrencies();
  const save = useSaveRecord();
  const uploadFiles = useUploadAttachments();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const remove = useDeleteRecord();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(() => initialState(state, accounts));
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const isEdit = state.mode === 'edit';
  // Lending, borrowing and repayments belong to a debt: their type and category are fixed.
  const debtId = isEdit ? state.record.debtId : null;
  const { data: debts = [] } = useDebts();
  const debt = debtId ? debts.find((d) => d.id === debtId) : undefined;

  // Accounts may still be loading when the dialog opens – pick defaults once they arrive.
  useEffect(() => {
    if (!accounts.length) return;
    setForm((f) => {
      if (f.accountId && accounts.some((a) => a.id === f.accountId)) return f;
      const defaults = initialState(state, accounts);
      return {
        ...f,
        accountId: defaults.accountId,
        toAccountId: f.toAccountId || defaults.toAccountId,
      };
    });
  }, [accounts, state]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const activeAccounts = accounts.filter(
    (a) => !a.archived || a.id === form.accountId || a.id === form.toAccountId,
  );
  const account = accounts.find((a) => a.id === form.accountId);
  const toAccount = accounts.find((a) => a.id === form.toAccountId);
  const currency = account?.currency ?? user.baseCurrency;
  const toCurrency = toAccount?.currency ?? currency;
  const crossCurrency = form.type === 'transfer' && !!toAccount && toCurrency !== currency;
  // Optional: the record was paid in another currency (e.g. abroad) and is converted.
  const [payCurrency, setPayCurrency] = useState<string | null>(null);
  const foreign = form.type !== 'transfer' && !!payCurrency && payCurrency !== currency;
  const rateMap = useMemo(() => {
    const r: Record<string, number> = {};
    if (currencies) {
      r[currencies.baseCurrency] = 1;
      for (const x of currencies.rates) r[x.currency] = x.rate;
    }
    return r;
  }, [currencies]);
  const foreignMinor = foreign ? parseAmountToMinor(form.amount || '0', payCurrency!) : null;
  const foreignRateKnown = !foreign || (payCurrency! in rateMap && currency in rateMap);
  const parsedAmount = foreign
    ? foreignMinor !== null && foreignRateKnown
      ? convertMinor(foreignMinor, payCurrency!, currency, rateMap)
      : null
    : parseAmountToMinor(form.amount || '0', currency);

  // Suggest the received amount for cross-currency transfers using the stored rates.
  useEffect(() => {
    if (!crossCurrency || form.toAmountTouched || !currencies) return;
    const rates: Record<string, number> = { [currencies.baseCurrency]: 1 };
    for (const r of currencies.rates) rates[r.currency] = r.rate;
    const converted = parsedAmount ? convertMinor(parsedAmount, currency, toCurrency, rates) : 0;
    setForm((f) => ({
      ...f,
      toAmount: converted ? minorToInputString(converted, toCurrency) : '',
    }));
  }, [crossCurrency, parsedAmount, currency, toCurrency, currencies, form.toAmountTouched]);

  // Keep the recorded amount expression readable when it contains an operator.
  const expressionPreview =
    /[+\-*/]/.test(form.amount.replace(/^-/, '')) && parsedAmount !== null
      ? money(parsedAmount, currency)
      : null;

  const submit = async (addAnother: boolean) => {
    setError(null);
    if (foreign && !foreignRateKnown) {
      setError(
        t('There is no exchange rate for {currency} yet – add it under Settings → Currencies.', {
          currency: payCurrency ?? '',
        }),
      );
      return;
    }
    const amount = foreign ? parsedAmount : parseAmountToMinor(form.amount, currency);
    const foreignNote =
      foreign && foreignMinor
        ? t('Paid {amount}', { amount: money(foreignMinor, payCurrency!) })
        : null;
    if (amount === null || amount <= 0) {
      setError(t('Enter an amount greater than zero'));
      amountRef.current?.focus();
      return;
    }
    if (!form.accountId) {
      setError(t('Choose an account'));
      return;
    }
    const occurredAt = new Date(`${form.date}T${form.time || '12:00'}`);
    if (Number.isNaN(occurredAt.getTime())) {
      setError(t('Enter a valid date and time'));
      return;
    }
    let input: RecordInput;
    if (form.type === 'transfer') {
      if (!form.toAccountId || form.toAccountId === form.accountId) {
        setError(t('Choose two different accounts'));
        return;
      }
      const toAmount = crossCurrency ? parseAmountToMinor(form.toAmount, toCurrency) : amount;
      if (!toAmount || toAmount <= 0) {
        setError(t('Enter the amount received by the destination account'));
        return;
      }
      input = {
        type: 'transfer',
        accountId: form.accountId,
        toAccountId: form.toAccountId,
        amount,
        toAmount,
        occurredAt: occurredAt.toISOString(),
        note: form.note || null,
        payee: null,
        labelIds: form.labelIds,
      };
    } else {
      input = {
        type: form.type,
        accountId: form.accountId,
        amount,
        categoryId: form.categoryId,
        occurredAt: occurredAt.toISOString(),
        note: [form.note, foreignNote].filter(Boolean).join(' · ') || null,
        payee: form.payee || null,
        labelIds: form.labelIds,
      };
    }
    try {
      const saved = await save.mutateAsync({ id: isEdit ? state.record.id : undefined, input });
      if (!isEdit && pendingFiles.length && saved[0]) {
        try {
          await uploadFiles.mutateAsync({ recordId: saved[0].id, files: pendingFiles });
        } catch (err) {
          toast.error(
            t('The record was saved, but a file could not be attached: {error}', {
              error: errorMessage(err),
            }),
          );
        }
        setPendingFiles([]);
      }
      lastAccount.set(form.accountId);
      if (form.type !== 'transfer') rememberCategory(form.type, form.categoryId);
      toast.success(
        isEdit
          ? t('Record updated')
          : form.type === 'transfer'
            ? t('Transfer saved')
            : form.type === 'expense'
              ? t('Expense saved')
              : t('Income saved'),
      );
      if (addAnother) {
        setForm((f) => ({
          ...f,
          amount: '',
          note: '',
          payee: '',
          toAmount: '',
          toAmountTouched: false,
        }));
        amountRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  /** Fills the form with a saved template (unknown or archived accounts are kept as chosen). */
  const applyTemplate = (tpl: RecordTemplate) => {
    const usable = (id: string | null) =>
      id && accounts.some((a) => a.id === id && !a.archived) ? id : null;
    setPayCurrency(null);
    setForm((f) => {
      const accountId = usable(tpl.accountId) ?? f.accountId;
      const accountCurrency = accounts.find((a) => a.id === accountId)?.currency ?? currency;
      return {
        ...f,
        type: tpl.type,
        accountId,
        toAccountId:
          tpl.type === 'transfer' ? (usable(tpl.toAccountId) ?? f.toAccountId) : f.toAccountId,
        categoryId: tpl.type === 'transfer' ? null : tpl.categoryId,
        amount: tpl.amount ? minorToInputString(tpl.amount, accountCurrency) : '',
        toAmount: '',
        toAmountTouched: false,
        payee: tpl.payee ?? '',
        note: tpl.note ?? '',
        labelIds: tpl.labelIds.filter((id) => labels.some((l) => l.id === id)),
      };
    });
    requestAnimationFrame(() =>
      tpl.amount ? amountRef.current?.select() : amountRef.current?.focus(),
    );
  };

  /** The current values as a template (the name is asked for separately). */
  const templateInput = () => ({
    type: form.type,
    accountId: form.accountId || null,
    toAccountId: form.type === 'transfer' ? form.toAccountId || null : null,
    categoryId: form.type === 'transfer' ? null : form.categoryId,
    amount: !foreign && parsedAmount && parsedAmount > 0 ? parsedAmount : null,
    note: form.note || null,
    payee: form.type === 'transfer' ? null : form.payee || null,
    labelIds: form.labelIds,
  });
  const suggestedTemplateName =
    form.type === 'transfer'
      ? `${account?.name ?? ''} → ${toAccount?.name ?? ''}`
      : form.payee || (form.categoryId ? categoryIndex.nameOf(form.categoryId) : '');

  /** Opens a new record pre-filled with the current values (dated now). */
  const duplicate = () => {
    const amount = parsedAmount ?? undefined;
    const toAmount = form.toAmount
      ? (parseAmountToMinor(form.toAmount, toCurrency) ?? undefined)
      : undefined;
    onDuplicate({
      type: form.type,
      accountId: form.accountId,
      toAccountId: form.toAccountId || undefined,
      categoryId: form.categoryId,
      amount,
      toAmount: crossCurrency ? toAmount : undefined,
      note: form.note,
      payee: form.payee,
      labelIds: form.labelIds,
    });
  };

  const onDelete = async () => {
    if (!isEdit) return;
    const ok = await confirm({
      title: t('Delete this record?'),
      description:
        state.record.type === 'transfer'
          ? t('Both sides of the transfer will be removed. This cannot be undone.')
          : t('This cannot be undone.'),
      confirmLabel: t('Delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(state.record.id);
      toast.success(t('Record deleted'));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const typeColor =
    form.type === 'expense'
      ? 'text-expense'
      : form.type === 'income'
        ? 'text-income'
        : 'text-foreground';

  if (accounts.length === 0) {
    return (
      <DialogContent title={t('Add record')} size="md">
        <p className="text-sm text-muted-foreground">
          {t(
            'Create an account first (for example “Cash” or “Bank account”) – records always belong to an account.',
          )}
        </p>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={() => {
              onClose();
              window.location.assign('/accounts?new=1');
            }}
          >
            {t('Create an account')}
          </Button>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent
      title={picking ? t('Choose category') : isEdit ? t('Edit record') : t('Add record')}
      size="md"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        if (!isEdit) amountRef.current?.focus();
      }}
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          // grid-cols-1 = minmax(0, 1fr): the scrolling chip rows must not widen the dialog.
          className="grid grid-cols-1 gap-4"
        >
          {!isEdit && <TemplateChips categories={categoryIndex} onApply={applyTemplate} />}

          {!isEdit && !form.amount && suggestions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('Quick add')}</p>
              <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {suggestions
                  .filter((sg) => accounts.some((a) => a.id === sg.accountId))
                  .map((sg) => {
                    const acc = accounts.find((a) => a.id === sg.accountId)!;
                    const label = sg.payee || categoryIndex.nameOf(sg.categoryId);
                    return (
                      <button
                        key={`${sg.type}-${sg.accountId}-${sg.categoryId}-${sg.payee}`}
                        type="button"
                        title={`${categoryIndex.pathOf(sg.categoryId)} · ${acc.name}`}
                        onClick={() => {
                          // The suggestion's amount is in the account currency.
                          setPayCurrency(null);
                          setForm((f) => ({
                            ...f,
                            type: sg.type,
                            accountId: sg.accountId,
                            categoryId: sg.categoryId,
                            payee: sg.payee ?? '',
                            amount: minorToInputString(sg.lastAmount, acc.currency),
                          }));
                          requestAnimationFrame(() => amountRef.current?.select());
                        }}
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-3 text-xs hover:bg-muted"
                      >
                        <IconBadge
                          icon={categoryIndex.iconOf(sg.categoryId)}
                          color={categoryIndex.colorOf(sg.categoryId)}
                          size="xs"
                        />
                        <span className="max-w-32 truncate font-medium">{label}</span>
                        <span
                          className={cn(
                            'tabular',
                            sg.type === 'expense' ? 'text-expense' : 'text-income',
                          )}
                        >
                          {money(sg.lastAmount, acc.currency)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {debtId ? (
            <p className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <Handshake className="size-4 shrink-0 text-muted-foreground" />
              <span>
                {state.mode === 'edit' && debtRecordTitle(state.record, debt)} ·{' '}
                <span className="text-muted-foreground">
                  {t('part of a debt – not counted as income or expense')}
                </span>
              </span>
            </p>
          ) : (
            <Segmented<RecordType>
              value={form.type}
              onChange={(v) => setForm((f) => ({ ...f, type: v }))}
              className="w-full"
              options={[
                {
                  value: 'expense',
                  label: (
                    <>
                      <Minus /> {t('Expense')}
                    </>
                  ),
                  className: 'text-expense',
                },
                {
                  value: 'income',
                  label: (
                    <>
                      <Plus /> {t('Income')}
                    </>
                  ),
                  className: 'text-income',
                },
                {
                  value: 'transfer',
                  label: (
                    <>
                      <Repeat /> {t('Transfer')}
                    </>
                  ),
                },
              ]}
            />
          )}

          <div className="rounded-2xl bg-muted/60 px-4 py-3">
            <label htmlFor="amount" className="text-xs font-medium text-muted-foreground">
              {form.type === 'transfer' ? t('Amount sent') : t('Amount')}
            </label>
            <div className="flex items-baseline gap-2">
              <span className={cn('text-3xl font-semibold', typeColor)}>
                {form.type === 'expense' ? '−' : form.type === 'income' ? '+' : ''}
              </span>
              <input
                id="amount"
                ref={amountRef}
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                className={cn(
                  'tabular w-full min-w-0 bg-transparent text-3xl font-semibold outline-none placeholder:text-muted-foreground/40',
                  typeColor,
                )}
              />
              {form.type === 'transfer' ? (
                <span className="text-lg font-medium text-muted-foreground">
                  {getCurrency(currency).symbol}
                </span>
              ) : (
                <select
                  aria-label={t('Currency paid in')}
                  value={payCurrency ?? currency}
                  onChange={(e) =>
                    setPayCurrency(e.target.value === currency ? null : e.target.value)
                  }
                  className="cursor-pointer rounded-md bg-transparent py-1 text-right text-lg font-medium text-muted-foreground outline-none hover:text-foreground"
                >
                  <option value={currency}>{getCurrency(currency).symbol}</option>
                  {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {foreign && (
              <p className="mt-1 text-xs text-muted-foreground">
                {foreignRateKnown
                  ? t('Paid in {currency} · ≈ {amount} on {account}', {
                      currency: payCurrency ?? '',
                      amount: money(parsedAmount ?? 0, currency),
                      account: account?.name ?? t('the account'),
                    })
                  : t('No exchange rate for {currency} yet – add it in Settings.', {
                      currency: payCurrency ?? '',
                    })}
              </p>
            )}
            {!foreign && expressionPreview && (
              <p className="mt-1 text-xs text-muted-foreground">= {expressionPreview}</p>
            )}
          </div>

          {form.type === 'transfer' ? (
            <div className="grid gap-3">
              <Field label={t('From account')} htmlFor="from">
                <Select
                  id="from"
                  value={form.accountId}
                  onChange={(e) => set('accountId', e.target.value)}
                >
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {money(a.balance, a.currency)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="-my-1 flex justify-center">
                <span className="rounded-full bg-muted p-1.5 text-muted-foreground">
                  <ArrowDown className="size-4" />
                </span>
              </div>
              <Field label={t('To account')} htmlFor="to">
                <Select
                  id="to"
                  value={form.toAccountId}
                  onChange={(e) => set('toAccountId', e.target.value)}
                >
                  <option value="">{t('Choose account…')}</option>
                  {activeAccounts
                    .filter((a) => a.id !== form.accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {money(a.balance, a.currency)}
                      </option>
                    ))}
                </Select>
              </Field>
              {crossCurrency && (
                <Field
                  label={t('Amount received ({currency})', { currency: toCurrency })}
                  htmlFor="toAmount"
                  hint={t(
                    'Suggested from your exchange rates – adjust it to what you actually received.',
                  )}
                >
                  <Input
                    id="toAmount"
                    inputMode="decimal"
                    value={form.toAmount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, toAmount: e.target.value, toAmountTouched: true }))
                    }
                  />
                </Field>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Account')} htmlFor="account" className="sm:col-span-2">
                <Select
                  id="account"
                  value={form.accountId}
                  onChange={(e) => set('accountId', e.target.value)}
                >
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {money(a.balance, a.currency)}
                    </option>
                  ))}
                </Select>
              </Field>
              {!debtId && (
                <Field label={t('Category')} className="sm:col-span-2">
                  <CategoryButton value={form.categoryId} onClick={() => setPicking(true)} />
                </Field>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Date')} htmlFor="date">
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                required
              />
            </Field>
            <Field label={t('Time')} htmlFor="time">
              <Input
                id="time"
                type="time"
                value={form.time}
                onChange={(e) => set('time', e.target.value)}
              />
            </Field>
          </div>

          {form.type !== 'transfer' && (
            <Field label={form.type === 'income' ? t('Payer') : t('Payee')} htmlFor="payee">
              <Input
                id="payee"
                list="payee-options"
                value={form.payee}
                onChange={(e) => set('payee', e.target.value)}
                placeholder={
                  form.type === 'income' ? t('Who paid you?') : t('Shop, company or person')
                }
                maxLength={120}
              />
              <datalist id="payee-options">
                {payees.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
          )}

          <Field label={t('Note')} htmlFor="note">
            <Textarea
              id="note"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder={t('What was it for?')}
              maxLength={500}
              rows={2}
            />
          </Field>

          {!user.isDemo && (
            <Field label={t('Receipts & files')}>
              <AttachmentsField
                recordId={isEdit ? state.record.id : undefined}
                pending={pendingFiles}
                onPendingChange={setPendingFiles}
              />
            </Field>
          )}

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

          {!debtId && (
            <SaveTemplateButton input={templateInput} suggestedName={suggestedTemplateName} />
          )}

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {isEdit && (
              <>
                <Button
                  variant="destructive-ghost"
                  onClick={onDelete}
                  loading={remove.isPending}
                  className="sm:mr-auto"
                >
                  <Trash2 /> {t('Delete')}
                </Button>
                {!debtId && (
                  <Button variant="outline" onClick={duplicate}>
                    <Copy /> {t('Duplicate')}
                  </Button>
                )}
              </>
            )}
            {!isEdit && (
              <Button
                variant="outline"
                onClick={() => void submit(true)}
                disabled={save.isPending || uploadFiles.isPending}
                className="sm:mr-auto"
              >
                {t('Save & add another')}
              </Button>
            )}
            <Button
              type="submit"
              loading={save.isPending || uploadFiles.isPending}
              className="sm:min-w-28"
            >
              {isEdit ? t('Save changes') : t('Save')}
            </Button>
          </div>
        </form>
      )}
    </DialogContent>
  );
}
