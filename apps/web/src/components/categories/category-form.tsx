import type { Category } from '@slavotax/shared';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useCategories, useSaveCategory } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { ColorPicker, IconPicker } from '@/components/ui/pickers';
import { t } from '@/i18n';
import { buildCategoryIndex } from '@/lib/categories';

export function CategoryFormDialog({
  category,
  defaults,
  onClose,
}: {
  category?: Category;
  defaults?: { parentId?: string | null; kind?: 'expense' | 'income' };
  onClose: () => void;
}) {
  const { data: categories } = useCategories();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const save = useSaveCategory();
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(
    category?.kind ?? defaults?.kind ?? 'expense',
  );
  const [parentId, setParentId] = useState<string>(category?.parentId ?? defaults?.parentId ?? '');
  const parent = parentId ? index.byId.get(parentId) : undefined;
  const [icon, setIcon] = useState(category?.icon ?? 'shapes');
  const [color, setColor] = useState(category?.color ?? parent?.color ?? '#64748B');
  const [ownColor, setOwnColor] = useState(!!category?.color || !parentId);
  const [error, setError] = useState<string | null>(null);
  const hasChildren = category ? index.childrenOf(category.id).length > 0 : false;
  const displayColor = parentId && !ownColor ? (parent?.color ?? '#64748B') : color;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (category) {
        await save.mutateAsync({
          id: category.id,
          input: {
            name,
            icon,
            color: parentId && !ownColor ? null : color,
            parentId: parentId || null,
          },
        });
      } else {
        await save.mutateAsync({
          input: {
            name,
            icon,
            kind,
            parentId: parentId || null,
            color: parentId && !ownColor ? null : color,
          },
        });
      }
      toast.success(category ? t('Category updated') : t('Category created'));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const parentOptions = index
    .topLevel(parentId ? parent?.kind : kind, true)
    .filter((c) => c.id !== category?.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={category ? t('Edit category') : t('New category')} size="md">
        <form onSubmit={submit} className="grid gap-4">
          {!category && !parentId && (
            <Segmented<'expense' | 'income'>
              value={kind}
              onChange={setKind}
              className="w-full"
              options={[
                { value: 'expense', label: t('Expense category') },
                { value: 'income', label: t('Income category') },
              ]}
            />
          )}
          <div className="flex items-end gap-3">
            <IconBadge icon={icon} color={displayColor} size="lg" />
            <Field label={t('Name')} htmlFor="cat-name" className="flex-1">
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </Field>
          </div>
          <Field
            label={t('Parent category')}
            htmlFor="cat-parent"
            hint={
              hasChildren
                ? t('Groups that contain subcategories cannot be moved.')
                : t('Leave empty to create a top-level group.')
            }
          >
            <Select
              id="cat-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={hasChildren}
            >
              <option value="">{t('— None (top-level group) —')}</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Icon')}>
            <IconPicker value={icon} onChange={setIcon} color={displayColor} />
          </Field>
          <Field label={t('Colour')}>
            {parentId && (
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!ownColor}
                  onChange={(e) => setOwnColor(!e.target.checked)}
                />
                {t('Use the colour of “{name}”', { name: parent?.name ?? '' })}
              </label>
            )}
            {(!parentId || ownColor) && <ColorPicker value={color} onChange={setColor} />}
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {category ? t('Save changes') : t('Create category')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
