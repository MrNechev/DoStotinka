import { useId } from 'react';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  // Unique gradient id: several logos can be mounted at once (some of them hidden).
  const id = `slv-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10B981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <path
        d="M41.5 21.5c-2.2-2.4-5.6-3.7-9.4-3.7-6.1 0-10.3 3.2-10.3 7.9 0 4.4 3.3 6.4 9.6 7.7 4.4.9 5.7 1.8 5.7 3.6 0 1.9-2 3.2-5.1 3.2-3.3 0-6-1.3-8.1-3.6l-3.7 4c2.6 3 6.8 4.7 11.6 4.7 6.7 0 11.1-3.3 11.1-8.4 0-4.6-3.1-6.6-9.6-7.9-4.2-.8-5.6-1.6-5.6-3.3 0-1.7 1.8-2.8 4.4-2.8 2.6 0 4.8 1 6.4 2.7l3-4.1Z"
        fill="#fff"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">Slavotax</span>
    </div>
  );
}
