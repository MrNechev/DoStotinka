import { ACCOUNT_TYPE_LABELS } from '@slavotax/shared';
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useAccounts, useDeleteAccountItem, useRecords } from '@/api/queries';
import { accountIcon } from '@/components/accounts/account-card';
import { AccountFormDialog, AdjustBalanceDialog } from '@/components/accounts/account-form';
import { useRecordEditor } from '@/components/records/record-editor';
import { RecordList } from '@/components/records/record-list';
import {
  BalanceChart,
  CashflowChart,
  CategoryBreakdown,
  KpiTiles,
} from '@/components/stats/charts';
import { IntervalToggle, PeriodPicker, useStatsFilters } from '@/components/stats/filters';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/misc';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function AccountDetailPage() {
  const { id = '' } = useParams();
  const { data: accounts, isLoading } = useAccounts();
  const account = accounts?.find((a) => a.id === id);
  const filters = useStatsFilters('account', { preset: '30d', offset: 0 }, [id]);
  const { openNew } = useRecordEditor();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const remove = useDeleteAccountItem();
  const [dialog, setDialog] = useState<'edit' | 'adjust' | null>(null);
  const records = useRecords({ accountIds: [id], from: filters.scope.from, to: filters.scope.to });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!account) {
    return (
      <EmptyState
        title="Account not found"
        action={
          <Button asChild variant="outline">
            <Link to="/accounts">Back to accounts</Link>
          </Button>
        }
      />
    );
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${account.name}”?`,
      description: `This permanently deletes the account and its ${account.recordCount} records. Transfers to other accounts keep their other side. Consider archiving instead.`,
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(account.id);
      toast.success('Account deleted');
      navigate('/accounts');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const items = records.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <Link
          to="/accounts"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Accounts
        </Link>
        <Card className="overflow-hidden">
          <div className="h-1.5" style={{ backgroundColor: account.color }} />
          <div className="flex flex-wrap items-center gap-4 p-5">
            <IconBadge icon={accountIcon(account)} color={account.color} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold">{account.name}</h1>
                {account.archived && <Badge>archived</Badge>}
                {account.excludeFromStats && <Badge>excluded from statistics</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
                {account.note ? ` · ${account.note}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Current balance</p>
              <p
                className={cn(
                  'tabular text-2xl font-semibold',
                  account.balance < 0 && 'text-expense',
                )}
              >
                {money(account.balance, account.currency)}
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => openNew({ accountId: account.id })}
              >
                <Plus /> Add record
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Pencil />} onSelect={() => setDialog('edit')}>
                    Edit account
                  </MenuItem>
                  <MenuItem icon={<Scale />} onSelect={() => setDialog('adjust')}>
                    Adjust balance
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Trash2 />} destructive onSelect={onDelete}>
                    Delete account
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker filters={filters} />
        <IntervalToggle filters={filters} />
      </div>

      <KpiTiles scope={filters.scope} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Balance" description={filters.resolved.label} />
          <div className="px-3 pb-4">
            <BalanceChart scope={filters.scope} interval={filters.interval} color={account.color} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Cash flow" description={filters.resolved.label} />
          <div className="px-3 pb-4">
            <CashflowChart scope={filters.scope} interval={filters.interval} height={260} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <CategoryBreakdown scope={filters.scope} type="expense" compact />
        <CategoryBreakdown scope={filters.scope} type="income" compact />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Records" description={filters.resolved.label} />
        <RecordList
          records={items}
          isLoading={records.isLoading}
          hasMore={records.hasNextPage}
          loadingMore={records.isFetchingNextPage}
          onLoadMore={() => void records.fetchNextPage()}
          showAccount={false}
          emptyTitle="No records in this period"
        />
      </Card>

      {dialog === 'edit' && <AccountFormDialog account={account} onClose={() => setDialog(null)} />}
      {dialog === 'adjust' && (
        <AdjustBalanceDialog account={account} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
