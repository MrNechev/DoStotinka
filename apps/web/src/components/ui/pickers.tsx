import { COLOR_PALETTE, normalizeBrandText } from '@dostotinka/shared';
import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { t } from '@/i18n';
import { BRANDS, brandOf, COUNTRY_NAMES } from '@/lib/brand-icons';

import { ICON_NAMES } from '@/lib/icon-registry';
import { cn } from '@/lib/utils';
import { Icon, IconBadge } from './category-icon';
import { Input, Select } from './input';

/** Logos offered for accounts: banks, payment services and meal vouchers (not shops). */
const ACCOUNT_BRANDS = BRANDS.filter((b) => b.kind !== 'shop');
const SERVICES = 'services';
const OTHER_COUNTRIES = [
  ...new Set(ACCOUNT_BRANDS.map((b) => b.country).filter((c): c is string => !!c && c !== 'BG')),
].sort((a, b) => (COUNTRY_NAMES[a] ?? a).localeCompare(COUNTRY_NAMES[b] ?? b));

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={t('Colour {c}', { c })}
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
        title={t('Custom colour')}
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
  brands = false,
}: {
  value: string;
  onChange: (i: string) => void;
  color: string;
  /** Offer bank and voucher logos first (for accounts). */
  brands?: boolean;
}) {
  const [search, setSearch] = useState('');
  const icons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES;
  }, [search]);
  const [bankSearch, setBankSearch] = useState('');
  const [country, setCountry] = useState(() => {
    const current = brandOf(value);
    if (!current) return 'BG';
    return current.kind === 'bank' ? (current.country ?? 'BG') : SERVICES;
  });
  const brandList = useMemo(() => {
    const q = normalizeBrandText(bankSearch);
    if (q) {
      return ACCOUNT_BRANDS.filter(
        (b) => normalizeBrandText(b.name).includes(q) || b.key.includes(q),
      ).slice(0, 40);
    }
    return country === SERVICES
      ? ACCOUNT_BRANDS.filter((b) => b.kind !== 'bank')
      : ACCOUNT_BRANDS.filter((b) => b.kind === 'bank' && b.country === country);
  }, [bankSearch, country]);
  return (
    <div>
      {brands && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t('Bank or card logo')}
          </p>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setBankSearch('');
              }}
              aria-label={t('Country')}
              className="h-9"
            >
              <option value="BG">{t(COUNTRY_NAMES.BG!)}</option>
              <option value={SERVICES}>{t('Payment services & vouchers')}</option>
              {OTHER_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {t(COUNTRY_NAMES[c] ?? c)}
                </option>
              ))}
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                placeholder={t('Search banks…')}
                className="h-9 pl-9"
                aria-label={t('Search banks…')}
              />
            </div>
          </div>
          {brandList.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">{t('No bank found.')}</p>
          )}
          <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
            {brandList.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onChange(b.id)}
                title={b.name}
                className={cn(
                  'flex w-16 cursor-pointer flex-col items-center gap-1 rounded-xl p-1.5 text-[11px] leading-tight text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  value === b.id && 'bg-muted text-foreground',
                )}
                aria-pressed={value === b.id}
              >
                <IconBadge icon={b.id} color={value === b.id ? color : 'var(--border)'} size="lg" />
                <span className="w-full truncate text-center">{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {brands && <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('Icons')}</p>}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search icons…')}
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
