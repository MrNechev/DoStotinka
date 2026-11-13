import type { Account, InboxItem } from '@dostotinka/shared';
import {
  ArrowLeftRight,
  Bell,
  Check,
  CheckCheck,
  Inbox,
  Landmark,
  Link2,
  RotateCcw,
  Settings2,
  Smartphone,
  Wand2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useConfirmInbox,
  useInbox,
  useInboxAction,
  useInboxBulk,
  useUpdateInbox,
  useUser,
} from '@/api/queries';
import { accountIcon } from '@/components/accounts/account-card';
import { CategoryButton, CategoryPickerPanel } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Badge, Card, EmptyState, PageHeader, Segmented, Spinner } from '@/components/ui/misc';
import { t, tn } from '@/i18n';
import { ago } from '@/lib/date';
import { longDate, money, timeLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tab = 'pending' | 'done' | 'ignored';

function SourceIcon({ item }: { item: InboxItem }) {
  const Icon = item.origin === 'bank' ? Landmark : Smartphone;
  return <Icon className="size-3.5 shrink-0" aria-hidden />;
}

function when(item: InboxItem) {
  // Bank bookings carry a date only; notifications the exact time.
  return item.origin === 'bank'
    ? longDate(item.occurredAt)
    : `${longDate(item.occurredAt)}, ${timeLabel(item.occurredAt)}`;
}

function PendingCard({ item, accounts }: { item: InboxItem; accounts: Account[] }) {
  const update = useUpdateInbox();
  const confirm = useConfirmInbox();
  const action = useInboxAction();
  const [picking, setPicking] = useState(false);
  const [payee, setPayee] = useState(item.payee ?? '');
  const account = accounts.find((a) => a.id === item.accountId);
  const pairAccount = item.pair ? accounts.find((a) => a.id === item.pair?.accountId) : undefined;
  const busy = update.isPending || confirm.isPending || action.isPending;
  const save = (body: Parameters<typeof update.mutate>[0]) =>
    update.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  const run = (a: 'dismiss' | 'link' | 'unmatch' | 'transfer', ok?: string) =>
    action.mutate(
      { id: item.id, action: a },
      {
        onSuccess: () => ok && toast.success(ok),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {account ? (
          <IconBadge icon={accountIcon(account)} color={account.color} size="md" />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.payee || item.description || t('Unknown')}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <SourceIcon item={item} />
            <span>{item.sourceLabel}</span>
            <span aria-hidden>·</span>
            <span>{when(item)}</span>
          </p>
        </div>
        <p
          className={cn(
            'tabular shrink-0 text-right font-semibold',
            item.type === 'income' ? 'text-income' : 'text-expense',
          )}
        >
          {item.type === 'income' ? '+' : '−'}
          {item.amount !== null && item.currency ? money(item.amount, item.currency) : ''}
        </p>
      </div>

      {item.description && item.description !== item.payee && (
        <p className="mt-2 line-clamp-2 break-words rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
          {item.description}
        </p>
      )}
      {item.note && (
        <p className="mt-2 truncate text-sm">
          <span className="text-muted-foreground">{t('Note')}:</span> {item.note}
        </p>
      )}

      {item.match && (
        <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <p>
            {t('Looks like a record you already entered: {what} on {date}.', {
              what: item.match.payee || item.match.note || t('a record'),
              date: longDate(item.match.occurredAt),
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => run('link', t('Linked to the existing record'))}
              disabled={busy}
            >
              <Link2 /> {t('Same transaction')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => run('unmatch')} disabled={busy}>
              {t('Not the same')}
            </Button>
          </div>
        </div>
      )}

      {item.pair && (
        <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
          <p>
            {item.type === 'expense'
              ? t('Looks like a transfer to {account}.', { account: pairAccount?.name ?? '?' })
              : t('Looks like a transfer from {account}.', { account: pairAccount?.name ?? '?' })}
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => run('transfer', t('Transfer saved'))}
            disabled={busy}
          >
            <ArrowLeftRight /> {t('Save as transfer')}
          </Button>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
        <Select
          aria-label={t('Account')}
          value={item.accountId ?? ''}
          onChange={(e) => save({ id: item.id, accountId: e.target.value || null })}
        >
          <option value="">{t('Choose an account')}</option>
          {accounts
            .filter((a) => !a.archived || a.id === item.accountId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
        </Select>
        <Segmented
          size="sm"
          value={item.type}
          onChange={(type) => save({ id: item.id, type, categoryId: null })}
          options={[
            { value: 'expense', label: t('Expense') },
            { value: 'income', label: t('Income') },
          ]}
          className="h-10 w-full [&>button]:h-8"
        />
        <div className="sm:col-span-2">
          <CategoryButton value={item.categoryId} onClick={() => setPicking(true)} />
        </div>
        <Input
          aria-label={t('Payee')}
          placeholder={t('Payee')}
          value={payee}
          maxLength={120}
          onChange={(e) => setPayee(e.target.value)}
          onBlur={() => {
            if ((payee || null) !== item.payee) save({ id: item.id, payee: payee || null });
          }}
          className="sm:col-span-2"
        />
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => run('dismiss')} disabled={busy}>
          <X /> {t('Dismiss')}
        </Button>
        <Button
          size="sm"
          loading={confirm.isPending}
          disabled={busy || !item.accountId}
          title={item.accountId ? undefined : t('Choose an account first')}
          onClick={() =>
            confirm.mutate(
              { id: item.id, ...(payee !== (item.payee ?? '') ? { payee: payee || null } : {}) },
              {
                onSuccess: () => toast.success(t('Record added')),
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          <Check /> {t('Add record')}
        </Button>
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent title={t('Choose category')} size="md">
          <CategoryPickerPanel
            kind={item.type}
            value={item.categoryId}
            onBack={() => setPicking(false)}
            onSelect={(categoryId) => {
              setPicking(false);
              save({ id: item.id, categoryId });
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'neutral' | 'info' }> = {
  confirmed: { label: t('Added'), tone: 'success' },
  dismissed: { label: t('Dismissed'), tone: 'neutral' },
  duplicate: { label: t('Already recorded'), tone: 'info' },
};

function DoneRow({ item, accounts }: { item: InboxItem; accounts: Account[] }) {
  const action = useInboxAction();
  const account = accounts.find((a) => a.id === item.accountId);
  const status = STATUS_LABEL[item.status];
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.payee || item.description || t('Unknown')}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <SourceIcon item={item} />
          <span>{item.sourceLabel}</span>
          <span aria-hidden>·</span>
          <span>{when(item)}</span>
          {account && (
            <>
              <span aria-hidden>·</span>
              <span>{account.name}</span>
            </>
          )}
        </p>
      </div>
      {status && <Badge tone={status.tone}>{status.label}</Badge>}
      <span
        className={cn(
          'tabular w-24 shrink-0 text-right text-sm font-medium',
          item.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {item.amount !== null && item.currency ? money(item.amount, item.currency) : ''}
      </span>
      {item.status !== 'confirmed' && (
        <Button
          variant="ghost"
          size="icon-sm"
          title={t('Back to the inbox')}
          aria-label={t('Back to the inbox')}
          onClick={() =>
            action.mutate(
              { id: item.id, action: 'restore' },
              { onError: (e) => toast.error(errorMessage(e)) },
            )
          }
        >
          <RotateCcw />
        </Button>
      )}
    </li>
  );
}

function IgnoredRow({ item }: { item: InboxItem }) {
  return (
    <li className="px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <Bell className="size-3.5" aria-hidden />
        <span className="font-medium text-foreground">{item.sourceLabel}</span>
        <span aria-hidden>·</span>
        <span>{ago(item.createdAt)}</span>
      </p>
      <p className="mt-1 break-words text-sm">{item.description}</p>
    </li>
  );
}

export default function InboxPage() {
  const user = useUser();
  const [tab, setTab] = useState<Tab>('pending');
  const { data: items = [], isLoading } = useInbox(tab);
  const { data: accounts = [] } = useAccounts();
  const bulk = useInboxBulk();
  const ready = items.filter(
    (i) => i.status === 'pending' && i.accountId && i.categoryId && !i.match && !i.pair,
  );
  const enabled = user.automaticImport.notifications || user.automaticImport.bank;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('Inbox')}
        description={t(
          'Transactions imported automatically – check them and add them to your records.',
        )}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/rules">
                <Wand2 /> {t('Rules')}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/automatic-import">
                <Settings2 /> {t('Automatic import')}
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: t('To review') },
            { value: 'done', label: t('Done') },
            { value: 'ignored', label: t('Not recognised') },
          ]}
        />
        {tab === 'pending' && ready.length > 1 && (
          <Button
            size="sm"
            variant="secondary"
            loading={bulk.isPending}
            onClick={() =>
              bulk.mutate(
                { ids: ready.map((i) => i.id), action: 'confirm' },
                {
                  onSuccess: (r) =>
                    toast.success(tn(r.done, '{n} record added', '{n} records added')),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <CheckCheck />{' '}
            {tn(ready.length, 'Add {n} ready transaction', 'Add all {n} ready transactions')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox />}
            title={
              tab === 'pending'
                ? t('Nothing to review')
                : tab === 'done'
                  ? t('Nothing here yet')
                  : t('No unrecognised notifications')
            }
            description={
              !enabled
                ? t(
                    'Turn on automatic import to get transactions from your bank or from your phone’s payment notifications.',
                  )
                : tab === 'ignored'
                  ? t(
                      'Notifications from your phone that were not a payment show up here for two weeks.',
                    )
                  : t('New transactions appear here as soon as they arrive.')
            }
            action={
              !enabled ? (
                <Button asChild>
                  <Link to="/automatic-import">{t('Set up automatic import')}</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : tab === 'pending' ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <PendingCard key={item.id} item={item} accounts={accounts} />
          ))}
        </div>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((item) =>
              tab === 'done' ? (
                <DoneRow key={item.id} item={item} accounts={accounts} />
              ) : (
                <IgnoredRow key={item.id} item={item} />
              ),
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}
