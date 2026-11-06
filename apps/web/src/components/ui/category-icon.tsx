import { CircleHelp } from 'lucide-react';
import { brandOf } from '@/lib/brand-icons';
import { ICONS } from '@/lib/icon-registry';
import { cn } from '@/lib/utils';

export function Icon({
  name,
  className,
  strokeWidth,
}: {
  name: string | null | undefined;
  className?: string;
  strokeWidth?: number;
}) {
  const Cmp = (name && ICONS[name]) || CircleHelp;
  return <Cmp className={className} strokeWidth={strokeWidth} aria-hidden />;
}

const SIZE_PX = { xs: 24, sm: 32, md: 40, lg: 48 } as const;

const SIZES = {
  xs: 'size-6 [&>svg]:size-3.5',
  sm: 'size-8 [&>svg]:size-4',
  md: 'size-10 [&>svg]:size-5',
  lg: 'size-12 [&>svg]:size-6',
};

/** A coloured circle with an icon – the visual identity of categories and accounts. */
export function IconBadge({
  icon,
  color,
  size = 'md',
  variant = 'solid',
  className,
}: {
  icon: string | null | undefined;
  color: string;
  size?: keyof typeof SIZES;
  variant?: 'solid' | 'soft';
  className?: string;
}) {
  const brand = brandOf(icon);
  if (brand) {
    // A logo keeps its own colours on a white disc; the chosen colour stays visible as a ring.
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white',
          SIZES[size],
          className,
        )}
        style={{
          boxShadow: `inset 0 0 0 ${size === 'xs' || size === 'sm' ? 1.5 : 2}px ${color}`,
          padding: Math.round(SIZE_PX[size] * brand.padding),
        }}
        title={brand.name}
      >
        <img src={brand.src} alt="" className="size-full object-contain" draggable={false} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        SIZES[size],
        className,
      )}
      style={
        variant === 'solid'
          ? { backgroundColor: color, color: '#fff' }
          : { backgroundColor: `${color}22`, color }
      }
    >
      <Icon name={icon} strokeWidth={2.1} />
    </span>
  );
}
