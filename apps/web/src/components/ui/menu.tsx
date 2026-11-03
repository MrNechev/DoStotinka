import { Check } from 'lucide-react';
import { DropdownMenu as M, Popover as P } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

const surface =
  'animate-pop-in z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 text-sm shadow-xl';

export function MenuContent({
  className,
  align = 'end',
  ...props
}: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={6} align={align} className={cn(surface, className)} {...props} />
    </M.Portal>
  );
}

export function MenuItem({
  className,
  destructive,
  icon,
  children,
  ...props
}: ComponentProps<typeof M.Item> & { destructive?: boolean; icon?: ReactNode }) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground',
        destructive && 'text-destructive [&_svg]:text-destructive',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </M.Item>
  );
}

export function MenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-8 pr-2.5 outline-none data-[highlighted]:bg-muted',
        className,
      )}
      {...props}
    >
      <M.ItemIndicator className="absolute left-2.5">
        <Check className="size-4" />
      </M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <M.Label className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </M.Label>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({
  className,
  align = 'start',
  ...props
}: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={6}
        align={align}
        collisionPadding={12}
        className={cn(surface, 'p-0', className)}
        {...props}
      />
    </P.Portal>
  );
}
