import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  children,
  className,
  size = 'md',
  title,
  description,
  hideClose,
  onOpenAutoFocus,
}: {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  title: ReactNode;
  description?: ReactNode;
  hideClose?: boolean;
  onOpenAutoFocus?: (e: Event) => void;
}) {
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[
    size
  ];
  return (
    <D.Portal>
      <D.Overlay className="animate-overlay-in fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      <D.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          'dialog-content fixed z-50 flex max-h-[92dvh] w-full flex-col border border-border bg-card text-card-foreground shadow-2xl outline-none',
          // mobile: bottom sheet
          'bottom-0 left-0 right-0 rounded-t-2xl',
          // desktop: centered dialog
          'sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <D.Title className="text-lg font-semibold leading-tight">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-muted-foreground">
                {description}
              </D.Description>
            ) : (
              <D.Description className="sr-only">
                {typeof title === 'string' ? title : 'Dialog'}
              </D.Description>
            )}
          </div>
          {!hideClose && (
            <D.Close
              className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </D.Close>
          )}
        </div>
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end',
        className,
      )}
    >
      {children}
    </div>
  );
}
