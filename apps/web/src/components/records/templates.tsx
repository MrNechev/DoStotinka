import type { RecordTemplate, TemplateInput } from '@dostotinka/shared';
import { BookmarkPlus, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useCategories,
  useDeleteTemplate,
  useSaveTemplate,
  useTemplates,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Card, CardHeader } from '@/components/ui/misc';
import { t } from '@/i18n';
import { buildCategoryIndex, type CategoryIndex } from '@/lib/categories';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Saved templates as a row of chips at the top of the record editor. */
export function TemplateChips({
  categories,
  onApply,
}: {
  categories: CategoryIndex;
  onApply: (template: RecordTemplate) => void;
}) {
  const { data: templates = [] } = useTemplates();
  const { data: accounts = [] } = useAccounts();
  if (!templates.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('Templates')}</p>
      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {templates.map((tpl) => {
          const account = accounts.find((a) => a.id === tpl.accountId);
          const isTransfer = tpl.type === 'transfer';
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onApply(tpl)}
              title={[
                account?.name,
                isTransfer ? t('Transfer') : categories.pathOf(tpl.categoryId),
                tpl.payee,
              ]
                .filter(Boolean)
                .join(' · ')}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-primary/50 py-1 pl-1 pr-3 text-xs hover:bg-primary-soft"
            >
              <IconBadge
                icon={isTransfer ? 'arrow-left-right' : categories.iconOf(tpl.categoryId)}
                color={isTransfer ? '#64748B' : categories.colorOf(tpl.categoryId)}
                size="xs"
              />
              <span className="max-w-36 truncate font-medium">{tpl.name}</span>
              {tpl.amount !== null && account && (
                <span
                  className={cn(
                    'tabular',
                    tpl.type === 'expense' && 'text-expense',
                    tpl.type === 'income' && 'text-income',
                  )}
                >
                  {money(tpl.amount, account.currency)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Asks for a name and saves the current editor values as a template. */
export function SaveTemplateButton({
  input,
  suggestedName,
}: {
  input: () => Omit<TemplateInput, 'name'>;
  suggestedName: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const save = useSaveTemplate();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="justify-self-start text-muted-foreground"
        onClick={() => {
          setName(suggestedName);
          setOpen(true);
        }}
      >
        <BookmarkPlus /> {t('Save as template')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent
            size="sm"
            title={t('Save as template')}
            description={t(
              'Templates appear at the top of the record editor and fill in all values with one tap.',
            )}
          >
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  await save.mutateAsync({ input: { ...input(), name } });
                  toast.success(t('Template saved'));
                  setOpen(false);
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Field label={t('Name')} htmlFor="template-name">
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  autoFocus
                />
              </Field>
              <DialogFooter className="mt-0">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t('Cancel')}
                </Button>
                <Button type="submit" loading={save.isPending}>
                  {t('Save')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

/** Settings card listing the templates with rename and delete. */
export function TemplatesSection() {
  const { data: templates = [] } = useTemplates();
  const { data: accounts = [] } = useAccounts();
  const { data: categoryList } = useCategories();
  const categories = useMemo(() => buildCategoryIndex(categoryList), [categoryList]);
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<RecordTemplate | null>(null);
  const [name, setName] = useState('');

  const describe = (tpl: RecordTemplate) => {
    const account = accounts.find((a) => a.id === tpl.accountId);
    const to = accounts.find((a) => a.id === tpl.toAccountId);
    return [
      tpl.type === 'transfer'
        ? `${account?.name ?? '?'} → ${to?.name ?? '?'}`
        : [account?.name, categories.pathOf(tpl.categoryId)].filter(Boolean).join(' · '),
      tpl.amount !== null && account ? money(tpl.amount, account.currency) : null,
      tpl.payee,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <Card>
      <CardHeader
        title={t('Record templates')}
        description={t(
          'Save frequent records as templates with “Save as template” in the record editor.',
        )}
      />
      <div className="px-5 pb-5 pt-2">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('No templates yet.')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {templates.map((tpl) => (
              <li key={tpl.id} className="flex items-center gap-3 px-3 py-2.5">
                <IconBadge
                  icon={
                    tpl.type === 'transfer' ? 'arrow-left-right' : categories.iconOf(tpl.categoryId)
                  }
                  color={tpl.type === 'transfer' ? '#64748B' : categories.colorOf(tpl.categoryId)}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tpl.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{describe(tpl)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('Rename')}
                  title={t('Rename')}
                  onClick={() => {
                    setName(tpl.name);
                    setRenaming(tpl);
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('Delete')}
                  title={t('Delete')}
                  onClick={async () => {
                    const ok = await confirm({
                      title: t('Delete template “{name}”?', { name: tpl.name }),
                      confirmLabel: t('Delete'),
                      destructive: true,
                    });
                    if (!ok) return;
                    remove.mutate(tpl.id, { onError: (err) => toast.error(errorMessage(err)) });
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        {renaming && (
          <DialogContent size="sm" title={t('Rename template')}>
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const { id, createdAt: _created, ...rest } = renaming;
                try {
                  await save.mutateAsync({ id, input: { ...rest, name } });
                  setRenaming(null);
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Field label={t('Name')} htmlFor="rename-template">
                <Input
                  id="rename-template"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  autoFocus
                />
              </Field>
              <DialogFooter className="mt-0">
                <Button variant="outline" onClick={() => setRenaming(null)}>
                  {t('Cancel')}
                </Button>
                <Button type="submit" loading={save.isPending}>
                  {t('Save')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
