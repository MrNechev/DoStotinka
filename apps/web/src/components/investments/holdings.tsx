import {
  CURRENCIES,
  type Holding,
  type HoldingInput,
  type HoldingKind,
  minorToInputString,
  type PriceSource,
  parseAmountToMinor,
  type Quote,
} from '@dostotinka/shared';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/api/client';
import {
  useAccounts,
  useDeleteHolding,
  useHoldings,
  useRefreshPrices,
  useSaveHolding,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/category-icon';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Card, CardHeader, Segmented } from '@/components/ui/misc';
import { t } from '@/i18n';
import { ago } from '@/lib/date';
import { money, numberFmt, percent } from '@/lib/format';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<HoldingKind, string> = {
  etf: 'chart-pie',
  stock: 'chart-line',
  fund: 'briefcase',
  bond: 'file-text',
  crypto: 'bitcoin',
  other: 'gem',
};
const kindLabel = (k: HoldingKind) =>
  ({
    etf: t('ETF'),
    stock: t('Stock'),
    fund: t('Fund'),
    bond: t('Bond'),
    crypto: t('Crypto'),
    other: t('Other'),
  })[k];
const sourceLabel = (s: PriceSource) =>
  s === 'yahoo' ? 'Yahoo Finance' : s === 'coingecko' ? 'CoinGecko' : t('Typed in');

/** Accepts "1,5" and "1.5". */
const parseNumber = (s: string) => {
  const n = Number(s.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
};

/** Holdings of all investment accounts (or of one), with gains and price updates. */
export function HoldingsCard({ accountId }: { accountId?: string }) {
  const { data: all = [] } = useHoldings();
  const { data: accounts = [] } = useAccounts();
  const refresh = useRefreshPrices();
  const remove = useDeleteHolding();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Holding | 'new' | null>(null);
  const holdings = accountId ? all.filter((h) => h.accountId === accountId) : all;
  const investmentAccounts = accounts.filter((a) => a.type === 'investment' && !a.archived);
  const hasAuto = holdings.some((h) => h.priceSource !== 'manual');

  return (
    <Card>
      <CardHeader
        title={t('Investments')}
        description={t(
          'Shares, ETFs and crypto in your investment accounts, valued at their price.',
        )}
        action={
          <div className="flex gap-1.5">
            {hasAuto && (
              <Button
                variant="ghost"
                size="sm"
                loading={refresh.isPending}
                onClick={() =>
                  refresh.mutate(undefined, {
                    onSuccess: (r) =>
                      r.failed.length
                        ? toast.error(t('No price for: {list}', { list: r.failed.join(', ') }))
                        : toast.success(t('Prices updated')),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <RefreshCw /> <span className="hidden sm:inline">{t('Update prices')}</span>
              </Button>
            )}
            {investmentAccounts.length > 0 && (
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus /> {t('Add')}
              </Button>
            )}
          </div>
        }
      />
      <div className="px-5 pb-5 pt-1">
        {investmentAccounts.length === 0 && !holdings.length ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'Create an account of the type “Investment” (for example your broker) to add holdings.',
            )}
          </p>
        ) : !holdings.length ? (
          <p className="text-sm text-muted-foreground">
            {t('No holdings yet. Add what you own – the value updates with the price.')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {holdings.map((h) => {
              const account = accounts.find((a) => a.id === h.accountId);
              const ratio = h.costBasis ? h.gain / h.costBasis : null;
              return (
                <li key={h.id} className="flex items-center gap-3 py-3">
                  <IconBadge
                    icon={KIND_ICON[h.kind]}
                    color={account?.color ?? '#64748B'}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {h.name}
                      {h.symbol && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {h.symbol}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {numberFmt(h.quantity, 8)} × {numberFmt(h.price, 4)} {h.currency}
                      {!accountId && account ? ` · ${account.name}` : ''}
                      {h.priceUpdatedAt ? ` · ${ago(h.priceUpdatedAt)}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm font-semibold">{money(h.value, h.currency)}</p>
                    <p
                      className={cn(
                        'tabular text-xs',
                        h.gain > 0 && 'text-income',
                        h.gain < 0 && 'text-expense',
                        h.gain === 0 && 'text-muted-foreground',
                      )}
                    >
                      {money(h.gain, h.currency, { sign: 'exceptZero' })}
                      {ratio !== null && ` (${percent(ratio, 1)})`}
                    </p>
                  </div>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t('Actions')}>
                        <MoreHorizontal />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem icon={<Pencil />} onSelect={() => setEditing(h)}>
                        {t('Edit')}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        icon={<Trash2 />}
                        destructive
                        onSelect={async () => {
                          const ok = await confirm({
                            title: t('Delete “{name}”?', { name: h.name }),
                            description: t('Records of the account stay as they are.'),
                            confirmLabel: t('Delete'),
                            destructive: true,
                          });
                          if (ok)
                            remove.mutate(h.id, { onError: (e) => toast.error(errorMessage(e)) });
                        }}
                      >
                        {t('Delete')}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <HoldingDialog
            holding={editing === 'new' ? null : editing}
            accountId={accountId ?? investmentAccounts[0]?.id ?? ''}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </Card>
  );
}

function HoldingDialog({
  holding,
  accountId,
  onClose,
}: {
  holding: Holding | null;
  accountId: string;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const save = useSaveHolding();
  const investmentAccounts = accounts.filter(
    (a) => a.type === 'investment' && (!a.archived || a.id === holding?.accountId),
  );
  const [form, setForm] = useState(() => ({
    accountId: holding?.accountId ?? accountId,
    priceSource: holding?.priceSource ?? ('yahoo' as PriceSource),
    symbol: holding?.symbol ?? '',
    name: holding?.name ?? '',
    kind: holding?.kind ?? ('etf' as HoldingKind),
    quantity: holding ? String(holding.quantity) : '',
    price: holding ? String(holding.price) : '',
    currency: holding?.currency ?? accounts.find((a) => a.id === accountId)?.currency ?? 'EUR',
    costBasis: holding ? minorToInputString(holding.costBasis, holding.currency) : '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const lookUp = async () => {
    if (!form.symbol.trim() || form.priceSource === 'manual') return;
    setLooking(true);
    setError(null);
    try {
      const q = await api<Quote>(
        `/holdings/quote?source=${form.priceSource}&symbol=${encodeURIComponent(form.symbol.trim())}&currency=${form.currency}`,
      );
      setForm((f) => ({
        ...f,
        price: String(q.price),
        currency: q.currency,
        name: f.name || q.name || q.symbol,
        kind: q.kind ?? f.kind,
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLooking(false);
    }
  };

  const quantity = parseNumber(form.quantity);
  const price = parseNumber(form.price);
  const currentValue =
    Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!(quantity > 0)) return setError(t('Enter how many units you own'));
    if (!(price >= 0)) return setError(t('Enter the price of one unit'));
    const cost = form.costBasis.trim()
      ? parseAmountToMinor(form.costBasis, form.currency)
      : parseAmountToMinor(String(Math.round(quantity * price * 100) / 100), form.currency);
    if (cost === null || cost < 0) return setError(t('Enter what you paid in total'));
    const input: HoldingInput = {
      accountId: form.accountId,
      name: form.name.trim(),
      symbol: form.priceSource === 'manual' ? form.symbol.trim() || null : form.symbol.trim(),
      kind: form.kind,
      quantity,
      price,
      currency: form.currency,
      costBasis: cost,
      priceSource: form.priceSource,
    };
    try {
      await save.mutateAsync({ id: holding?.id, input });
      toast.success(t('Holding saved'));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <DialogContent title={holding ? t('Edit holding') : t('Add holding')} size="md">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4">
        {investmentAccounts.length > 1 && (
          <Field label={t('Account')} htmlFor="h-account">
            <Select
              id="h-account"
              value={form.accountId}
              onChange={(e) => set('accountId', e.target.value)}
            >
              {investmentAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('Price')}>
          <Segmented<PriceSource>
            value={form.priceSource}
            onChange={(v) => set('priceSource', v)}
            options={[
              { value: 'yahoo', label: sourceLabel('yahoo') },
              { value: 'coingecko', label: sourceLabel('coingecko') },
              { value: 'manual', label: sourceLabel('manual') },
            ]}
          />
        </Field>
        {form.priceSource !== 'manual' && (
          <Field
            label={form.priceSource === 'coingecko' ? t('Coin') : t('Ticker')}
            htmlFor="h-symbol"
            hint={
              form.priceSource === 'coingecko'
                ? t('The coin id from coingecko.com, e.g. bitcoin or ethereum.')
                : t(
                    'As on finance.yahoo.com, e.g. VWCE.DE, AAPL or IWDA.AS. Only the ticker is sent.',
                  )
            }
          >
            <div className="flex gap-2">
              <Input
                id="h-symbol"
                value={form.symbol}
                onChange={(e) => set('symbol', e.target.value)}
                onBlur={() => !form.price && void lookUp()}
                maxLength={40}
                required
                autoFocus={!holding}
              />
              <Button variant="outline" loading={looking} onClick={() => void lookUp()}>
                <Search /> {t('Look up')}
              </Button>
            </div>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label={t('Name')} htmlFor="h-name">
            <Input
              id="h-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={80}
              required
            />
          </Field>
          <Field label={t('Kind')} htmlFor="h-kind">
            <Select
              id="h-kind"
              value={form.kind}
              onChange={(e) => set('kind', e.target.value as HoldingKind)}
            >
              {(['etf', 'stock', 'fund', 'bond', 'crypto', 'other'] as const).map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('Units')} htmlFor="h-qty">
            <Input
              id="h-qty"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              required
            />
          </Field>
          <Field label={t('Price of one unit')} htmlFor="h-price">
            <Input
              id="h-price"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              required
            />
          </Field>
          <Field label={t('Currency')} htmlFor="h-cur">
            <Select
              id="h-cur"
              value={form.currency}
              onChange={(e) => set('currency', e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label={t('Paid in total')}
          htmlFor="h-cost"
          hint={t(
            'What you paid for all units – the gain is measured against it. Empty = the current value.',
          )}
        >
          <Input
            id="h-cost"
            inputMode="decimal"
            value={form.costBasis}
            onChange={(e) => set('costBasis', e.target.value)}
            placeholder={currentValue !== null ? numberFmt(currentValue, 2) : undefined}
          />
        </Field>
        {currentValue !== null && (
          <p className="text-sm text-muted-foreground">
            {t('Current value: {value}', {
              value: `${numberFmt(currentValue, 2)} ${form.currency}`,
            })}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
