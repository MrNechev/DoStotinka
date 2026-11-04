import { type Category, COLOR_PALETTE, type Label } from '@slavotax/shared';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useCategories,
  useCategoryUsage,
  useDeleteCategory,
  useDeleteLabel,
  useLabels,
  useReorderCategories,
  useSaveCategory,
  useSaveLabel,
} from '@/api/queries';
import { CategoryFormDialog } from '@/components/categories/category-form';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Segmented,
  Skeleton,
} from '@/components/ui/misc';
import { ColorPicker } from '@/components/ui/pickers';
import { t, tn } from '@/i18n';
import { buildCategoryIndex } from '@/lib/categories';
import { cn } from '@/lib/utils';

type Editing = {
  category?: Category;
  defaults?: { parentId?: string | null; kind?: 'expense' | 'income' };
} | null;

function LabelDialog({ label, onClose }: { label?: Label; onClose: () => void }) {
  const save = useSaveLabel();
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(label?.color ?? COLOR_PALETTE[10]!);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={label ? t('Edit label') : t('New label')}
        description={t(
          'Labels are free tags you can attach to any record, e.g. “Vacation” or “Work”.',
        )}
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await save.mutateAsync({ id: label?.id, input: { name, color } });
              onClose();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <Field label={t('Name')} htmlFor="label-name">
            <Input
              id="label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={40}
              autoFocus
            />
          </Field>
          <Field label={t('Colour')}>
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const { data: usage = {} } = useCategoryUsage();
  const { data: labels = [] } = useLabels();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const reorder = useReorderCategories();
  const removeLabel = useDeleteLabel();
  const confirm = useConfirm();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [editingLabel, setEditingLabel] = useState<Label | 'new' | null>(null);

  const q = search.trim().toLowerCase();
  const groups = index.topLevel(kind, true).filter((g) => showArchived || !g.archived);

  const groupUsage = (g: Category) =>
    (usage[g.id] ?? 0) + index.childrenOf(g.id).reduce((s, c) => s + (usage[c.id] ?? 0), 0);

  const onDelete = async (c: Category) => {
    const children = index.childrenOf(c.id);
    const count = c.parentId ? (usage[c.id] ?? 0) : groupUsage(c);
    const ok = await confirm({
      title: t('Delete “{name}”?', { name: c.name }),
      description: c.parentId
        ? tn(
            count,
            '{n} record will be moved to “{name}”.',
            '{n} records will be moved to “{name}”.',
            {
              name: index.nameOf(c.parentId),
            },
          )
        : t(
            'This also deletes its {subs} subcategories. {n} records will become uncategorized. Archiving keeps the history instead.',
            {
              subs: children.length,
              n: count,
            },
          ),
      confirmLabel: t('Delete'),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(c.id, {
      onSuccess: () => toast.success(t('Category deleted')),
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const toggleArchive = (c: Category) =>
    save.mutate(
      { id: c.id, input: { archived: !c.archived } },
      {
        onSuccess: () =>
          toast.success(c.archived ? t('Category restored') : t('Category archived')),
      },
    );

  /** Swaps a category with its neighbour among its siblings. */
  const move = (c: Category, dir: -1 | 1) => {
    const siblings = c.parentId ? index.childrenOf(c.parentId) : index.topLevel(c.kind, true);
    const ids = siblings.map((x) => x.id);
    const i = ids.indexOf(c.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };

  const renderActions = (c: Category) => (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('Actions')}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<ArrowUp />} onSelect={() => move(c, -1)}>
          {t('Move up')}
        </MenuItem>
        <MenuItem icon={<ArrowDown />} onSelect={() => move(c, 1)}>
          {t('Move down')}
        </MenuItem>
        <MenuSeparator />
        {!c.parentId && (
          <MenuItem
            icon={<Plus />}
            onSelect={() => setEditing({ defaults: { parentId: c.id, kind: c.kind } })}
          >
            {t('Add subcategory')}
          </MenuItem>
        )}
        <MenuItem icon={<Pencil />} onSelect={() => setEditing({ category: c })}>
          {t('Edit')}
        </MenuItem>
        <MenuItem
          icon={c.archived ? <ArchiveRestore /> : <Archive />}
          onSelect={() => toggleArchive(c)}
        >
          {c.archived ? t('Restore') : t('Archive')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} destructive onSelect={() => void onDelete(c)}>
          {t('Delete')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );

  return (
    <div>
      <PageHeader
        title={t('Categories')}
        description={t(
          'A detailed category tree for everything you spend on or earn. Customize it as you like.',
        )}
        actions={
          <Button onClick={() => setEditing({ defaults: { kind } })}>
            <Plus /> {t('New category')}
          </Button>
        }
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Segmented<'expense' | 'income'>
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: t('Expenses') },
                { value: 'income', label: t('Income') },
              ]}
            />
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search…')}
                className="h-9 pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              {t('Show archived')}
            </label>
          </div>
          {isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groups.map((g) => {
                const children = index
                  .childrenOf(g.id)
                  .filter((c) => showArchived || !c.archived)
                  .filter(
                    (c) =>
                      !q || c.name.toLowerCase().includes(q) || g.name.toLowerCase().includes(q),
                  );
                if (q && !g.name.toLowerCase().includes(q) && children.length === 0) return null;
                const isOpen = open.has(g.id) || !!q;
                return (
                  <div key={g.id} className={cn(g.archived && 'opacity-60')}>
                    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => {
                          const next = new Set(open);
                          next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                          setOpen(next);
                        }}
                        className="-my-1 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg py-1 text-left"
                      >
                        <ChevronRight
                          className={cn(
                            'size-4 shrink-0 text-muted-foreground transition-transform',
                            isOpen && 'rotate-90',
                          )}
                        />
                        <IconBadge icon={g.icon} color={g.color ?? '#64748B'} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium">{g.name}</span>
                            {g.archived && <Badge>{t('archived')}</Badge>}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {tn(
                              index.childrenOf(g.id).length,
                              '{n} subcategory',
                              '{n} subcategories',
                            )}{' '}
                            · {tn(groupUsage(g), '{n} record', '{n} records')}
                          </span>
                        </span>
                      </button>
                      {renderActions(g)}
                    </div>
                    {isOpen && (
                      <div className="grid gap-px bg-muted/30 pb-2 pl-12 pr-3 sm:grid-cols-2">
                        {children.map((c) => (
                          <div
                            key={c.id}
                            className={cn(
                              'flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted',
                              c.archived && 'opacity-60',
                            )}
                          >
                            <IconBadge
                              icon={c.icon}
                              color={index.colorOf(c.id)}
                              size="sm"
                              variant="soft"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{c.name}</span>
                              <span className="block text-[11px] text-muted-foreground">
                                {tn(usage[c.id] ?? 0, '{n} record', '{n} records')}
                              </span>
                            </span>
                            {renderActions(c)}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setEditing({ defaults: { parentId: g.id, kind: g.kind } })}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-muted"
                        >
                          <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-primary/50">
                            <Plus className="size-4" />
                          </span>
                          {t('Add subcategory')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t('Labels')}
            description={t('Tags that work across categories')}
            action={
              <Button size="sm" variant="outline" onClick={() => setEditingLabel('new')}>
                <Plus /> {t('New')}
              </Button>
            }
          />
          {labels.length === 0 ? (
            <EmptyState
              icon={<Tag />}
              title={t('No labels yet')}
              description={t('E.g. “Vacation”, “Work” or “Gifts”.')}
              className="py-8"
            />
          ) : (
            <ul className="grid gap-0.5 px-2 pb-3">
              {labels.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted"
                >
                  <span className="size-3 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 text-sm">{l.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditingLabel(l)}
                    aria-label={t('Edit label')}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('Delete label')}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: t('Delete label “{name}”?', { name: l.name }),
                          description: t('It will be removed from all records.'),
                          confirmLabel: t('Delete'),
                          destructive: true,
                        })
                      ) {
                        removeLabel.mutate(l.id);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editing && (
        <CategoryFormDialog
          category={editing.category}
          defaults={editing.defaults}
          onClose={() => setEditing(null)}
        />
      )}
      {editingLabel && (
        <LabelDialog
          label={editingLabel === 'new' ? undefined : editingLabel}
          onClose={() => setEditingLabel(null)}
        />
      )}
    </div>
  );
}
