import { FolderTree, Tag, Trash2, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useAccounts, useBulkDeleteRecords, useBulkUpdateRecords, useLabels } from '@/api/queries';
import { CategoryPickerPanel } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu';
import { t, tn } from '@/i18n';
import { plural } from '@/lib/format';

/** Floating toolbar for actions on the selected records. */
export function BulkBar({
  selected,
  onClear,
  onSelectAll,
  totalLoaded,
}: {
  selected: string[];
  onClear: () => void;
  onSelectAll: () => void;
  totalLoaded: number;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: labels = [] } = useLabels();
  const update = useBulkUpdateRecords();
  const remove = useBulkDeleteRecords();
  const confirm = useConfirm();
  const [open, setOpen] = useState<'category' | 'account' | 'label' | null>(null);

  const apply = (input: Parameters<typeof update.mutate>[0], message: string) => {
    setOpen(null);
    update.mutate(input, {
      onSuccess: (res) => toast.success(`${message} (${plural(res.updated, 'record')})`),
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const count = selected.length;
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 lg:bottom-6 lg:pl-64">
      <div className="animate-pop-in flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-popover p-2 shadow-2xl">
        <span className="px-2 text-sm font-medium">
          {tn(count, '{n} record selected', '{n} records selected')}
        </span>
        {count < totalLoaded && (
          <Button size="sm" variant="ghost" onClick={onSelectAll}>
            {t('Select all {n}', { n: totalLoaded })}
          </Button>
        )}
        <Popover open={open === 'category'} onOpenChange={(o) => setOpen(o ? 'category' : null)}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" disabled={!count}>
              <FolderTree /> {t('Category')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(92vw,420px)] p-3" side="top">
            <CategoryPickerPanel
              kind="expense"
              value={null}
              onSelect={(categoryId) => apply({ ids: selected, categoryId }, t('Category changed'))}
            />
          </PopoverContent>
        </Popover>
        <Popover open={open === 'account'} onOpenChange={(o) => setOpen(o ? 'account' : null)}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" disabled={!count}>
              <Wallet /> {t('Account')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-1" side="top">
            {accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    apply(
                      { ids: selected, accountId: a.id },
                      t('Moved to {name}', { name: a.name }),
                    )
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.currency}</span>
                </button>
              ))}
            <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
              {t('Transfers are not moved.')}
            </p>
          </PopoverContent>
        </Popover>
        {labels.length > 0 && (
          <Popover open={open === 'label'} onOpenChange={(o) => setOpen(o ? 'label' : null)}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={!count}>
                <Tag /> {t('Label')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1" side="top">
              {labels.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 truncate">{l.name}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      apply(
                        { ids: selected, addLabelIds: [l.id] },
                        t('Label “{name}” added', { name: l.name }),
                      )
                    }
                  >
                    {t('Add')}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      apply(
                        { ids: selected, removeLabelIds: [l.id] },
                        t('Label “{name}” removed', { name: l.name }),
                      )
                    }
                  >
                    {t('Remove')}
                  </Button>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        )}
        <Button
          size="sm"
          variant="destructive-ghost"
          disabled={!count}
          loading={remove.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: tn(count, t('Delete {n} record?'), t('Delete {n} records?')),
              description: t(
                'Transfers are deleted together with their other side. This cannot be undone.',
              ),
              confirmLabel: t('Delete'),
              destructive: true,
            });
            if (!ok) return;
            remove.mutate(selected, {
              onSuccess: (res) => {
                toast.success(`${plural(res.deleted, 'record')} deleted`);
                onClear();
              },
              onError: (e) => toast.error(errorMessage(e)),
            });
          }}
        >
          <Trash2 /> {t('Delete')}
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClear} aria-label={t('Cancel selection')}>
          <X />
        </Button>
      </div>
    </div>
  );
}
