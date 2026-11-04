import { ACCOUNT_TYPE_LABELS, type Account, convertMinor } from '@dostotinka/shared';
import { ArrowDown, ArrowUp, Plus, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAccounts, useCurrencies, useReorderAccounts, useUser } from '@/api/queries';
import { accountIcon } from '@/components/accounts/account-card';
import { AccountFormDialog } from '@/components/accounts/account-form';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function AccountsPage() {
  const user = useUser();
  const { data: accounts, isLoading } = useAccounts();
  const { data: currencies } = useCurrencies();
  const reorder = useReorderAccounts();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (params.get('new')) {
      setEditing('new');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const rates = useMemo(() => {
    const r: Record<string, number> = { [user.baseCurrency]: 1 };
    for (const x of currencies?.rates ?? []) r[x.currency] = x.rate;
    return r;
  }, [currencies, user.baseCurrency]);

  const list = accounts ?? [];
  const active = list.filter((a) => !a.archived);
  const archived = list.filter((a) => a.archived);
  const total = active
    .filter((a) => !a.excludeFromStats)
    .reduce((s, a) => s + convertMinor(a.balance, a.currency, user.baseCurrency, rates), 0);
  const assets = active
    .filter((a) => a.balance > 0)
    .reduce((s, a) => s + convertMinor(a.balance, a.currency, user.baseCurrency, rates), 0);
  const debts = active
    .filter((a) => a.balance < 0)
    .reduce((s, a) => s + convertMinor(a.balance, a.currency, user.baseCurrency, rates), 0);

  const move = (id: string, dir: -1 | 1) => {
    const ids = list.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };

  const renderRow = (a: Account, i: number) => (
    <div key={a.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <Link to={`/accounts/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <IconBadge icon={accountIcon(a)} color={a.color} size="md" />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{a.name}</span>
            {a.excludeFromStats && <Badge>{t('excluded')}</Badge>}
            {a.archived && <Badge>{t('archived')}</Badge>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {t(ACCOUNT_TYPE_LABELS[a.type])} · {a.currency} ·{' '}
            {tn(a.recordCount, '{n} record', '{n} records')}
          </span>
        </span>
      </Link>
      <div className="text-right">
        <p className={cn('tabular font-semibold', a.balance < 0 && 'text-expense')}>
          {money(a.balance, a.currency)}
        </p>
        {a.currency !== user.baseCurrency && (
          <p className="tabular text-xs text-muted-foreground">
            ≈{' '}
            {money(
              convertMinor(a.balance, a.currency, user.baseCurrency, rates),
              user.baseCurrency,
            )}
          </p>
        )}
      </div>
      <div className="hidden flex-col sm:flex">
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          onClick={() => move(a.id, -1)}
          disabled={i === 0}
          aria-label={t('Move up')}
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          onClick={() => move(a.id, 1)}
          disabled={i === list.length - 1}
          aria-label={t('Move down')}
        >
          <ArrowDown className="size-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t('Accounts')}
        description={t(
          'Cash, bank accounts, savings, cards – each with its own balance and currency.',
        )}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('Add account')}
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Total balance')}</p>
          <p className="tabular mt-1 text-2xl font-semibold">{money(total, user.baseCurrency)}</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Assets')}</p>
          <p className="tabular mt-1 text-2xl font-semibold text-income">
            {money(assets, user.baseCurrency)}
          </p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">{t('Liabilities')}</p>
          <p className="tabular mt-1 text-2xl font-semibold text-expense">
            {money(debts, user.baseCurrency)}
          </p>
        </Card>
      </div>

      <Card className="divide-y divide-border overflow-hidden">
        {isLoading ? (
          <div className="grid gap-3 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <EmptyState
            icon={<Wallet />}
            title={t('No accounts yet')}
            description={t(
              'Create an account for every place you keep money – for example your wallet and your bank account.',
            )}
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus /> {t('Add account')}
              </Button>
            }
          />
        ) : (
          active.map((a) => renderRow(a, list.indexOf(a)))
        )}
      </Card>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            className="mb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived
              ? t('Hide archived accounts ({n})', { n: archived.length })
              : t('Show archived accounts ({n})', { n: archived.length })}
          </button>
          {showArchived && (
            <Card className="divide-y divide-border overflow-hidden opacity-80">
              {archived.map((a) => renderRow(a, list.indexOf(a)))}
            </Card>
          )}
        </div>
      )}

      {editing && (
        <AccountFormDialog
          account={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
