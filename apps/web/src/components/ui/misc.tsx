import { Check, Minus } from 'lucide-react';
import { Checkbox as CB, Switch as SW } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('card-shadow rounded-2xl border border-border bg-card', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-2', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info';
}) {
  const tones = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-income/12 text-income',
    danger: 'bg-expense/12 text-expense',
    warning: 'bg-warning/15 text-warning',
    info: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} style={style} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary',
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      {icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&_svg]:size-6">
          {icon}
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Checkbox({ className, checked, ...props }: ComponentProps<typeof CB.Root>) {
  return (
    <CB.Root
      checked={checked}
      className={cn(
        'flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-input bg-card transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CB.Indicator>
        {checked === 'indeterminate' ? (
          <Minus className="size-3.5" strokeWidth={3} />
        ) : (
          <Check className="size-3.5" strokeWidth={3} />
        )}
      </CB.Indicator>
    </CB.Root>
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-input transition-colors data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SW.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SW.Root>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  className?: string;
}

/** Pill shaped segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('inline-flex rounded-xl bg-muted p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium text-muted-foreground transition-all [&_svg]:size-4',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
            value === o.value && 'bg-card text-foreground shadow-sm',
            value === o.value && o.className,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  color,
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, backgroundColor: color ?? 'var(--primary)' }}
      />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
