import { type InputHTMLAttributes, type KeyboardEvent, useId, useMemo, useState } from 'react';
import { usePayeeUsage } from '@/api/queries';
import { BrandBadge } from '@/components/ui/category-icon';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';
import { payeeBrand } from '@/lib/brand-icons';
import { wordStart } from '@/lib/notes';
import { matchPayees, type PayeeSuggestion } from '@/lib/payees';
import { cn } from '@/lib/utils';

/** The payee with the typed part in bold. */
function Highlighted({ text, typed }: { text: string; typed: string }) {
  const query = typed.trim().toLocaleLowerCase();
  const lower = text.toLocaleLowerCase();
  const at = lower.startsWith(query) ? 0 : wordStart(lower, query);
  if (at < 0 || !query) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}

/**
 * The payee input: shows the logo of a known shop, and (with `suggest`) payees used before and
 * known shops while typing – tap one, or use ↓ / ↑ and Enter.
 */
export function PayeeField({
  value,
  onValueChange,
  suggest,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  suggest: boolean;
}) {
  const { data: usage = [] } = usePayeeUsage(suggest);
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const brand = payeeBrand(value);
  const matches = useMemo(
    () => (suggest && typing ? matchPayees(usage, value) : []),
    [suggest, typing, usage, value],
  );

  const choose = (s: PayeeSuggestion) => {
    onValueChange(s.name);
    setTyping(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => {
        const next = i + step;
        if (next >= matches.length) return -1;
        return next < -1 ? matches.length - 1 : next;
      });
    } else if (e.key === 'Enter' && active >= 0 && active < matches.length) {
      e.preventDefault();
      choose(matches[active]!);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setTyping(false);
      setActive(-1);
    }
  };

  return (
    <div className="relative">
      {brand && (
        <BrandBadge
          brand={brand}
          size="xs"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
        />
      )}
      <Input
        {...props}
        value={value}
        className={cn(brand && 'pl-11', props.className)}
        onChange={(e) => {
          onValueChange(e.target.value);
          setTyping(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setActive(-1);
          setTyping(false);
        }}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={matches.length ? listId : undefined}
        aria-expanded={matches.length > 0}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />
      {matches.length > 0 && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('Payees')}
          // Above the field: stays visible with the phone keyboard open.
          className="absolute inset-x-0 bottom-full z-20 mb-1 grid overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {matches.map((s, i) => (
            <button
              key={`${s.name}-${s.used}`}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted',
                i === active && 'bg-primary-soft text-primary hover:bg-primary-soft',
              )}
            >
              {s.brand ? (
                <BrandBadge brand={s.brand} size="xs" />
              ) : (
                <span className="size-6 shrink-0 rounded-full bg-muted" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">
                <Highlighted text={s.name} typed={value} />
              </span>
              {!s.used && (
                <span className="shrink-0 text-xs text-muted-foreground">{t('shop')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
