import { COLOR_PALETTE } from '@slavotax/shared';
import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ICON_NAMES } from '@/lib/icon-registry';
import { cn } from '@/lib/utils';
import { Icon } from './category-icon';
import { Input } from './input';

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Colour ${c}`}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full ring-1 ring-black/10 transition-transform hover:scale-110 dark:ring-white/20"
          style={{
            backgroundColor: c,
            boxShadow:
              value.toLowerCase() === c.toLowerCase()
                ? `0 0 0 2px var(--card), 0 0 0 4px ${c}`
                : undefined,
          }}
        >
          {value.toLowerCase() === c.toLowerCase() && (
            <Check className="size-4 text-white" strokeWidth={3} />
          )}
        </button>
      ))}
      <label
        className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-input text-xs text-muted-foreground"
        title="Custom colour"
      >
        +
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

export function IconPicker({
  value,
  onChange,
  color,
}: {
  value: string;
  onChange: (i: string) => void;
  color: string;
}) {
  const [search, setSearch] = useState('');
  const icons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES;
  }, [search]);
  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons…"
          className="h-9 pl-9"
        />
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto rounded-lg border border-border p-1.5 sm:grid-cols-10">
        {icons.map((name) => (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => onChange(name)}
            className={cn(
              'flex aspect-square cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              value === name && 'text-white hover:text-white',
            )}
            style={value === name ? { backgroundColor: color } : undefined}
          >
            <Icon name={name} className="size-[18px]" />
          </button>
        ))}
      </div>
    </div>
  );
}
