import { ACCOUNT_TYPE_LABELS, type Account } from '@dostotinka/shared';
import { Link } from 'react-router';
import { IconBadge } from '@/components/ui/category-icon';
import { t } from '@/i18n';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export const ACCOUNT_TYPE_ICONS: Record<string, string> = {
  cash: 'wallet',
  food_voucher: 'shopping-basket',
  checking: 'landmark',
  savings: 'piggy-bank',
  credit_card: 'credit-card',
  deposit: 'lock',
  investment: 'trending-up',
  asset: 'house',
  loan: 'hand-coins',
  other: 'circle-ellipsis',
};

export function accountIcon(a: Pick<Account, 'icon' | 'type'>) {
  return a.icon ?? ACCOUNT_TYPE_ICONS[a.type] ?? 'wallet';
}

export function AccountCard({ account, className }: { account: Account; className?: string }) {
  return (
    <Link
      to={`/accounts/${account.id}`}
      className={cn(
        'card-shadow group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md',
        account.archived && 'opacity-60',
        className,
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: account.color }} />
      <div className="flex items-center gap-2.5">
        <IconBadge icon={accountIcon(account)} color={account.color} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t(ACCOUNT_TYPE_LABELS[account.type])}
          </p>
        </div>
      </div>
      <p
        className={cn(
          'tabular truncate text-lg font-semibold',
          account.value < 0 && 'text-expense',
        )}
      >
        {money(account.value, account.currency)}
      </p>
    </Link>
  );
}
