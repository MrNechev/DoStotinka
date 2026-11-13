import type { Rule, RuleField, RuleInput, RuleMatch } from '@dostotinka/shared';
import {
  ArrowDown,
  ArrowUp,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useApplyRule,
  useCategories,
  useDeleteRule,
  useLabels,
  usePayeeUsage,
  useRenamePayee,
  useReorderRules,
  useRules,
  useSaveRule,
} from '@/api/queries';
import { CategoryButton, CategoryPickerPanel } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import {
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  PageHeader,
  Skeleton,
  Switch,
} from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { buildCategoryIndex } from '@/lib/categories';
import { cn } from '@/lib/utils';

const fieldLabel = (f: RuleField) =>
  f === 'payee' ? t('The payee') : f === 'note' ? t('The note') : t('Payee, note or bank text');
const matchLabel = (m: RuleMatch) =>
  m === 'starts' ? t('starts with') : m === 'equals' ? t('is') : t('contains');

export default function RulesPage() {
  const { data: rules, isLoading } = useRules();
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [applying, setApplying] = useState<Rule | null>(null);

  return (
    <div>
      <PageHeader
        title={t('Rules')}
        description={t(
          'Rules fill in imported transactions (inbox, CSV import) and suggest the category while you type.',
        )}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('New rule')}
          </Button>
        }
      />
      <div className="grid gap-5">
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : !rules?.length ? (
          <Card>
            <EmptyState
              icon={<Wand2 />}
              title={t('No rules yet')}
              description={t(
                'For example: payee contains “LIDL” → category Groceries, payee “Lidl”.',
              )}
              action={
                <Button onClick={() => setEditing('new')}>
                  <Plus /> {t('New rule')}
                </Button>
              }
            />
          </Card>
        ) : (
          <RuleList rules={rules} onEdit={setEditing} onApply={setApplying} />
        )}
        <PayeesCard />
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <RuleDialog
            rule={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={(rule, isNew) => {
              setEditing(null);
              if (isNew) setApplying(rule);
            }}
          />
        )}
      </Dialog>
      <Dialog open={!!applying} onOpenChange={(o) => !o && setApplying(null)}>
        {applying && <ApplyDialog rule={applying} onClose={() => setApplying(null)} />}
      </Dialog>
    </div>
  );
}

function useRuleSummary() {
  const { data: categoryList } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: labels = [] } = useLabels();
  const categories = useMemo(() => buildCategoryIndex(categoryList), [categoryList]);
  return {
    categories,
    condition: (r: Rule) =>
      [
        `${fieldLabel(r.field)} ${matchLabel(r.match)} “${r.pattern}”`,
        r.recordType === 'expense' ? t('expenses only') : null,
        r.recordType === 'income' ? t('income only') : null,
        r.accountId ? accounts.find((a) => a.id === r.accountId)?.name : null,
      ]
        .filter(Boolean)
        .join(' · '),
    actions: (r: Rule) =>
      [
        r.categoryId ? categories.pathOf(r.categoryId) : null,
        r.setPayee ? t('payee “{value}”', { value: r.setPayee }) : null,
        r.setNote ? t('note “{value}”', { value: r.setNote }) : null,
        ...r.labelIds.map((id) => labels.find((l) => l.id === id)?.name).filter(Boolean),
      ]
        .filter(Boolean)
        .join(' · '),
  };
}

function RuleList({
  rules,
  onEdit,
  onApply,
}: {
  rules: Rule[];
  onEdit: (r: Rule) => void;
  onApply: (r: Rule) => void;
}) {
  const save = useSaveRule();
  const remove = useDeleteRule();
  const reorder = useReorderRules();
  const confirm = useConfirm();
  const summary = useRuleSummary();
  const onError = (err: unknown) => toast.error(errorMessage(err));

  const move = (index: number, by: number) => {
    const ids = rules.map((r) => r.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    reorder.mutate(ids, { onError });
  };

  return (
    <Card>
      <CardHeader
        title={t('Your rules')}
        description={t('Rules higher up win when several set the same thing.')}
      />
      <ul className="divide-y divide-border px-2 pb-2">
        {rules.map((r, i) => (
          <li
            key={r.id}
            className={cn('flex items-center gap-3 px-3 py-3', !r.enabled && 'opacity-60')}
          >
            <IconBadge
              icon={r.categoryId ? summary.categories.iconOf(r.categoryId) : 'circle-dot'}
              color={r.categoryId ? summary.categories.colorOf(r.categoryId) : '#64748B'}
              size="sm"
            />
            <button
              type="button"
              className="min-w-0 flex-1 cursor-pointer text-left"
              onClick={() => onEdit(r)}
            >
              {r.name && <p className="truncate text-sm font-semibold">{r.name}</p>}
              <p className="truncate text-sm">{summary.condition(r)}</p>
              <p className="truncate text-xs text-muted-foreground">→ {summary.actions(r)}</p>
            </button>
            <div className="hidden items-center sm:flex">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('Move up')}
                title={t('Move up')}
                disabled={i === 0 || reorder.isPending}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('Move down')}
                title={t('Move down')}
                disabled={i === rules.length - 1 || reorder.isPending}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
            </div>
            <Switch
              checked={r.enabled}
              aria-label={t('Enabled')}
              onCheckedChange={(enabled) =>
                save.mutate({ id: r.id, input: { ...toInput(r), enabled } }, { onError })
              }
            />
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t('Actions')}>
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Pencil />} onSelect={() => onEdit(r)}>
                  {t('Edit')}
                </MenuItem>
                <MenuItem icon={<History />} onSelect={() => onApply(r)}>
                  {t('Apply to past records')}
                </MenuItem>
                <MenuItem icon={<ArrowUp />} disabled={i === 0} onSelect={() => move(i, -1)}>
                  {t('Move up')}
                </MenuItem>
                <MenuItem
                  icon={<ArrowDown />}
                  disabled={i === rules.length - 1}
                  onSelect={() => move(i, 1)}
                >
                  {t('Move down')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={<Trash2 />}
                  destructive
                  onSelect={async () => {
                    const ok = await confirm({
                      title: t('Delete this rule?'),
                      description: t('Records it already changed stay as they are.'),
                      confirmLabel: t('Delete'),
                      destructive: true,
                    });
                    if (ok) remove.mutate(r.id, { onError });
                  }}
                >
                  {t('Delete')}
                </MenuItem>
              </MenuContent>
            </Menu>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function toInput(r: Rule): RuleInput {
  return {
    name: r.name,
    enabled: r.enabled,
    field: r.field,
    match: r.match,
    pattern: r.pattern,
    recordType: r.recordType,
    accountId: r.accountId,
    categoryId: r.categoryId,
    setPayee: r.setPayee,
    setNote: r.setNote,
    labelIds: r.labelIds,
  };
}

function RuleDialog({
  rule,
  onClose,
  onSaved,
}: {
  rule: Rule | null;
  onClose: () => void;
  onSaved: (rule: Rule, isNew: boolean) => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: labels = [] } = useLabels();
  const { data: categoryList } = useCategories();
  const categories = useMemo(() => buildCategoryIndex(categoryList), [categoryList]);
  const save = useSaveRule();
  const [form, setForm] = useState<RuleInput>(
    rule
      ? toInput(rule)
      : {
          name: '',
          field: 'any',
          match: 'contains',
          pattern: '',
          recordType: null,
          accountId: null,
          categoryId: null,
          setPayee: '',
          setNote: '',
          labelIds: [],
        },
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RuleInput>(key: K, value: RuleInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const categoryKind = form.categoryId ? categories.byId.get(form.categoryId)?.kind : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (
      !form.categoryId &&
      !form.setPayee?.trim() &&
      !form.setNote?.trim() &&
      !form.labelIds?.length
    ) {
      setError(t('Choose at least one thing the rule changes'));
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: rule?.id, input: form });
      toast.success(t('Rule saved'));
      onSaved(saved, !rule);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <DialogContent
      title={picking ? t('Choose category') : rule ? t('Edit rule') : t('New rule')}
      size="md"
    >
      {picking ? (
        <CategoryPickerPanel
          kind={form.recordType === 'income' ? 'income' : 'expense'}
          value={form.categoryId ?? null}
          onBack={() => setPicking(false)}
          onSelect={(id) => {
            set('categoryId', id);
            setPicking(false);
          }}
        />
      ) : (
        <form onSubmit={submit} className="grid grid-cols-1 gap-4">
          <p className="text-sm font-medium">{t('When')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Text')} htmlFor="rule-field">
              <Select
                id="rule-field"
                value={form.field}
                onChange={(e) => set('field', e.target.value as RuleField)}
              >
                <option value="any">{fieldLabel('any')}</option>
                <option value="payee">{fieldLabel('payee')}</option>
                <option value="note">{fieldLabel('note')}</option>
              </Select>
            </Field>
            <Field label={t('Match')} htmlFor="rule-match">
              <Select
                id="rule-match"
                value={form.match}
                onChange={(e) => set('match', e.target.value as RuleMatch)}
              >
                <option value="contains">{matchLabel('contains')}</option>
                <option value="starts">{matchLabel('starts')}</option>
                <option value="equals">{matchLabel('equals')}</option>
              </Select>
            </Field>
          </div>
          <Field
            label={t('Text to look for')}
            htmlFor="rule-pattern"
            hint={t('Upper and lower case do not matter.')}
          >
            <Input
              id="rule-pattern"
              value={form.pattern}
              onChange={(e) => set('pattern', e.target.value)}
              placeholder={t('e.g. LIDL')}
              maxLength={120}
              required
              autoFocus
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Type')} htmlFor="rule-type">
              <Select
                id="rule-type"
                value={form.recordType ?? ''}
                onChange={(e) => {
                  const v = (e.target.value || null) as RuleInput['recordType'];
                  setForm((f) => ({
                    ...f,
                    recordType: v,
                    // A category of the other kind would not fit.
                    categoryId: v && categoryKind && categoryKind !== v ? null : f.categoryId,
                  }));
                }}
              >
                <option value="">{t('Expenses and income')}</option>
                <option value="expense">{t('Expenses only')}</option>
                <option value="income">{t('Income only')}</option>
              </Select>
            </Field>
            <Field label={t('Account')} htmlFor="rule-account">
              <Select
                id="rule-account"
                value={form.accountId ?? ''}
                onChange={(e) => set('accountId', e.target.value || null)}
              >
                <option value="">{t('All accounts')}</option>
                {accounts
                  .filter((a) => !a.archived || a.id === form.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>

          <p className="mt-1 text-sm font-medium">{t('Then')}</p>
          <Field label={t('Category')}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CategoryButton
                  value={form.categoryId ?? null}
                  onClick={() => setPicking(true)}
                  placeholder={t('Leave as it is')}
                />
              </div>
              {form.categoryId && (
                <Button variant="ghost" size="sm" onClick={() => set('categoryId', null)}>
                  {t('Clear')}
                </Button>
              )}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Rename the payee to')} htmlFor="rule-payee">
              <Input
                id="rule-payee"
                value={form.setPayee ?? ''}
                onChange={(e) => set('setPayee', e.target.value)}
                placeholder={t('Leave as it is')}
                maxLength={120}
              />
            </Field>
            <Field label={t('Note (when empty)')} htmlFor="rule-note">
              <Input
                id="rule-note"
                value={form.setNote ?? ''}
                onChange={(e) => set('setNote', e.target.value)}
                placeholder={t('Leave as it is')}
                maxLength={500}
              />
            </Field>
          </div>
          {labels.length > 0 && (
            <Field label={t('Add labels')}>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const active = form.labelIds?.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() =>
                        set(
                          'labelIds',
                          active
                            ? (form.labelIds ?? []).filter((x) => x !== l.id)
                            : [...(form.labelIds ?? []), l.id],
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
          <Field label={t('Name (optional)')} htmlFor="rule-name">
            <Input
              id="rule-name"
              value={form.name ?? ''}
              onChange={(e) => set('name', e.target.value)}
              maxLength={60}
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

/** Counts the past records a rule would change, then applies it. */
function ApplyDialog({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const apply = useApplyRule();
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<{ matched: number; changed: number } | null>(null);
  const { mutate } = apply;

  useEffect(() => {
    setPreview(null);
    mutate(
      { id: rule.id, dryRun: true, overwriteCategory: overwrite },
      { onSuccess: setPreview, onError: (err) => toast.error(errorMessage(err)) },
    );
  }, [mutate, rule.id, overwrite]);

  return (
    <DialogContent
      size="sm"
      title={t('Apply to past records?')}
      description={t('The rule changes the records you already have that match it.')}
    >
      <div className="grid gap-4">
        <p className="text-sm">
          {preview === null
            ? t('Counting…')
            : preview.changed === 0
              ? t('No records would change.')
              : tn(preview.changed, '{n} record would change.', '{n} records would change.')}
        </p>
        {rule.categoryId && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={overwrite}
              onCheckedChange={(v) => setOverwrite(v === true)}
            />
            {t('Also replace categories that are already set')}
          </label>
        )}
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={onClose}>
            {t('Not now')}
          </Button>
          <Button
            disabled={!preview?.changed}
            loading={apply.isPending && preview !== null}
            onClick={() =>
              apply.mutate(
                { id: rule.id, dryRun: false, overwriteCategory: overwrite },
                {
                  onSuccess: (r) => {
                    toast.success(tn(r.changed, '{n} record changed', '{n} records changed'));
                    onClose();
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }
          >
            {t('Apply')}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

/** All payees with rename / merge – for cleaning up names imported from banks. */
function PayeesCard() {
  const { data: payees, isLoading } = usePayeeUsage();
  const rename = useRenamePayee();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    const list = payees ?? [];
    return (q ? list.filter((p) => p.payee.toLocaleLowerCase().includes(q)) : list).slice(0, 200);
  }, [payees, search]);
  const mergesWith = editing && payees?.find((p) => p.payee === name.trim() && p.payee !== editing);

  return (
    <Card>
      <CardHeader
        title={t('Payees')}
        description={t(
          'Rename payees in all records. Renaming to an existing payee merges the two.',
        )}
      />
      <div className="px-5 pb-5 pt-2">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search payees')}
            className="pl-9"
            aria-label={t('Search payees')}
          />
        </div>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : !shown.length ? (
          <p className="text-sm text-muted-foreground">{t('No payees found.')}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {shown.map((p) => (
              <li key={p.payee} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{p.payee}</span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">
                  {tn(p.count, '{n} record', '{n} records')}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('Rename')}
                  title={t('Rename')}
                  onClick={() => {
                    setName(p.payee);
                    setEditing(p.payee);
                  }}
                >
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent size="sm" title={t('Rename payee')} description={editing}>
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const r = await rename.mutateAsync({ from: editing, to: name.trim() });
                  toast.success(tn(r.changed, '{n} record changed', '{n} records changed'));
                  setEditing(null);
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Field
                label={t('New name')}
                htmlFor="payee-name"
                hint={
                  mergesWith
                    ? t('“{name}” already exists – the two are merged.', { name: mergesWith.payee })
                    : undefined
                }
              >
                <Input
                  id="payee-name"
                  list="payee-merge-options"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  required
                  autoFocus
                />
                <datalist id="payee-merge-options">
                  {(payees ?? []).slice(0, 300).map((p) => (
                    <option key={p.payee} value={p.payee} />
                  ))}
                </datalist>
              </Field>
              <DialogFooter className="mt-0">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  {t('Cancel')}
                </Button>
                <Button
                  type="submit"
                  loading={rename.isPending}
                  disabled={!name.trim() || name.trim() === editing}
                >
                  {mergesWith ? t('Merge') : t('Rename')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
