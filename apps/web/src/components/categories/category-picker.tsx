import type { Category } from '@slavotax/shared';
import { ArrowLeft, Check, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCategories } from '@/api/queries';
import { IconBadge } from '@/components/ui/category-icon';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';
import { buildCategoryIndex } from '@/lib/categories';
import { cn, storage } from '@/lib/utils';

const recentStore = (kind: string) => storage<string[]>(`recent-categories.${kind}`, []);

export function rememberCategory(kind: 'expense' | 'income', id: string | null | undefined) {
  if (!id) return;
  const store = recentStore(kind);
  store.set([id, ...store.get().filter((x) => x !== id)].slice(0, 8));
}

/**
 * Full category chooser: search across all (sub)categories, recently used shortcuts and a
 * two-level browser (groups → subcategories).
 */
export function CategoryPickerPanel({
  kind,
  value,
  onSelect,
  onBack,
  allowAllKinds = true,
}: {
  kind: 'expense' | 'income';
  value: string | null;
  onSelect: (id: string | null) => void;
  onBack?: () => void;
  allowAllKinds?: boolean;
}) {
  const { data: categories = [] } = useCategories();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const [search, setSearch] = useState('');
  const [showOtherKind, setShowOtherKind] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(() => index.rootOf(value));

  const activeKind = showOtherKind ? (kind === 'expense' ? 'income' : 'expense') : kind;
  const groups = index.topLevel(activeKind);
  const recent = recentStore(kind)
    .get()
    .map((id) => index.byId.get(id))
    .filter((c): c is Category => !!c && !c.archived);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return categories
      .filter((c) => !c.archived && c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ak = a.kind === kind ? 0 : 1;
        const bk = b.kind === kind ? 0 : 1;
        return ak - bk || a.name.localeCompare(b.name);
      })
      .slice(0, 40);
  }, [search, categories, kind]);

  const group = openGroup ? index.byId.get(openGroup) : undefined;

  const renderItem = (c: Category, showPath = false) => (
    <button
      key={c.id}
      type="button"
      onClick={() => onSelect(c.id)}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted',
        value === c.id && 'bg-primary-soft',
      )}
    >
      <IconBadge icon={c.icon} color={index.colorOf(c.id)} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{c.name}</span>
        {showPath && c.parentId && (
          <span className="block truncate text-xs text-muted-foreground">
            {index.nameOf(c.parentId)}
          </span>
        )}
      </span>
      {value === c.id && <Check className="size-4 text-primary" />}
    </button>
  );

  return (
    <div className="flex min-h-[420px] flex-col">
      <div className="mb-3 flex items-center gap-2">
        {(onBack || group) && (
          <button
            type="button"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            onClick={() => (group && !search ? setOpenGroup(null) : onBack?.())}
            aria-label={t('Back')}
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search categories…')}
            className="pl-9"
          />
        </div>
      </div>

      {search ? (
        <div className="grid gap-0.5">
          {results.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('No category matches “{search}”.', { search })}
            </p>
          )}
          {results.map((c) => renderItem(c, true))}
        </div>
      ) : group ? (
        <div className="grid gap-0.5">
          <button
            type="button"
            onClick={() => onSelect(group.id)}
            className={cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-muted',
              value === group.id && 'bg-primary-soft',
            )}
          >
            <IconBadge icon={group.icon} color={index.colorOf(group.id)} size="md" />
            <span className="flex-1">
              <span className="block text-sm font-semibold">{group.name}</span>
              <span className="block text-xs text-muted-foreground">
                {t('Use the whole group')}
              </span>
            </span>
            {value === group.id && <Check className="size-4 text-primary" />}
          </button>
          <div className="my-1 h-px bg-border" />
          {index
            .childrenOf(group.id)
            .filter((c) => !c.archived)
            .map((c) => renderItem(c))}
        </div>
      ) : (
        <>
          {recent.length > 0 && !showOtherKind && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('Recent')}
              </p>
              <div className="flex flex-wrap gap-2">
                {recent.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-sm hover:bg-muted"
                  >
                    <IconBadge icon={c.icon} color={index.colorOf(c.id)} size="xs" />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setOpenGroup(g.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted',
                  index.rootOf(value) === g.id && 'bg-primary-soft',
                )}
              >
                <IconBadge icon={g.icon} color={g.color ?? '#64748B'} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{g.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {index
                      .childrenOf(g.id)
                      .filter((c) => !c.archived)
                      .slice(0, 3)
                      .map((c) => c.name)
                      .join(', ')}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => onSelect(null)}
            >
              {t('No category')}
            </button>
            {allowAllKinds && (
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => setShowOtherKind((v) => !v)}
              >
                {showOtherKind
                  ? kind === 'expense'
                    ? t('Back to expense categories')
                    : t('Back to income categories')
                  : kind === 'expense'
                    ? t('Show income categories')
                    : t('Show expense categories')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Compact button that displays the chosen category. */
export function CategoryButton({
  value,
  onClick,
  placeholder = t('Choose a category'),
}: {
  value: string | null;
  onClick: () => void;
  placeholder?: string;
}) {
  const { data: categories = [] } = useCategories();
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const cat = value ? index.byId.get(value) : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full cursor-pointer items-center gap-3 rounded-lg border border-input bg-card px-2.5 text-left transition-colors hover:bg-muted"
    >
      {cat ? (
        <>
          <IconBadge icon={cat.icon} color={index.colorOf(cat.id)} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{cat.name}</span>
            {cat.parentId && (
              <span className="block truncate text-xs text-muted-foreground">
                {index.nameOf(cat.parentId)}
              </span>
            )}
          </span>
        </>
      ) : (
        <span className="flex-1 pl-1 text-sm text-muted-foreground">{placeholder}</span>
      )}
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}
