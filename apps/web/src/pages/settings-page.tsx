import { type CreatedToken, CURRENCIES, getCurrency } from '@slavotax/shared';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  BookOpen,
  Code,
  Copy,
  Download,
  FileJson,
  FileUp,
  KeyRound,
  Laptop,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useAddCurrency,
  useChangePassword,
  useCreateToken,
  useCurrencies,
  useDeleteAccount,
  useRefreshRates,
  useRemoveCurrency,
  useRevokeSession,
  useServerConfig,
  useSessions,
  useSetRates,
  useUpdateProfile,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/misc';
import { applyTheme, type ThemePref } from '@/hooks/use-theme';
import { numberFmt } from '@/lib/format';
import { browserTimeZone, downloadUrl } from '@/lib/utils';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="px-5 pb-5 pt-2">{children}</div>
    </Card>
  );
}

const LOCALES = [
  { value: 'auto', label: 'Automatic (browser)' },
  { value: 'en-US', label: '1,234.56 (en-US)' },
  { value: 'en-GB', label: '1,234.56 (en-GB)' },
  { value: 'de-DE', label: '1.234,56 (de-DE)' },
  { value: 'bg-BG', label: '1 234,56 (bg-BG)' },
  { value: 'fr-FR', label: '1 234,56 (fr-FR)' },
];

function ProfileSection() {
  const user = useUser();
  const update = useUpdateProfile();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  return (
    <Section title="Profile">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            { name, email },
            {
              onSuccess: () => toast.success('Profile saved'),
              onError: (err) => toast.error(errorMessage(err)),
            },
          );
        }}
      >
        <Field label="Name" htmlFor="s-name">
          <Input
            id="s-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </Field>
        <Field label="E-mail" htmlFor="s-email">
          <Input
            id="s-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={user.isDemo}
          />
        </Field>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            loading={update.isPending}
            disabled={name === user.name && email === user.email}
          >
            Save profile
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PreferencesSection() {
  const user = useUser();
  const update = useUpdateProfile();
  const timeZones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
        'timeZone',
      );
    } catch {
      return [user.timezone];
    }
  }, [user.timezone]);
  const save = (input: Parameters<typeof update.mutate>[0], msg = 'Preferences saved') =>
    update.mutate(input, {
      onSuccess: () => toast.success(msg),
      onError: (err) => toast.error(errorMessage(err)),
    });
  const detected = browserTimeZone();
  return (
    <Section title="Preferences">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Main currency"
          htmlFor="p-cur"
          hint="Totals, statistics and budgets are shown in this currency."
        >
          <Select
            id="p-cur"
            value={user.baseCurrency}
            onChange={(e) => save({ baseCurrency: e.target.value }, 'Main currency changed')}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} – {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Theme" htmlFor="p-theme">
          <Select
            id="p-theme"
            value={user.theme}
            onChange={(e) => {
              applyTheme(e.target.value as ThemePref);
              save({ theme: e.target.value as ThemePref });
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </Field>
        <Field label="Week starts on" htmlFor="p-week">
          <Select
            id="p-week"
            value={user.weekStartsOn}
            onChange={(e) => save({ weekStartsOn: Number(e.target.value) as 0 | 1 | 6 })}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
            <option value={6}>Saturday</option>
          </Select>
        </Field>
        <Field label="Number format" htmlFor="p-locale">
          <Select
            id="p-locale"
            value={user.locale === 'en' ? 'auto' : user.locale}
            onChange={(e) => save({ locale: e.target.value })}
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Time zone"
          htmlFor="p-tz"
          className="sm:col-span-2"
          hint={
            detected !== user.timezone
              ? `Your browser reports ${detected}.`
              : 'Used for background jobs and exports.'
          }
        >
          <Select
            id="p-tz"
            value={user.timezone}
            onChange={(e) => save({ timezone: e.target.value })}
          >
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Section>
  );
}

function CurrenciesSection() {
  const user = useUser();
  const { data } = useCurrencies();
  const setRates = useSetRates();
  const refresh = useRefreshRates();
  const add = useAddCurrency();
  const removeCur = useRemoveCurrency();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newCurrency, setNewCurrency] = useState('');

  useEffect(() => {
    if (data)
      setDrafts(
        Object.fromEntries(
          data.rates.map((r) => [r.currency, String(Number(r.rate.toPrecision(8)))]),
        ),
      );
  }, [data]);

  const dirty =
    data?.rates.filter(
      (r) =>
        drafts[r.currency] !== undefined &&
        Number(drafts[r.currency]) !== Number(r.rate.toPrecision(8)),
    ) ?? [];
  const tracked = new Set([user.baseCurrency, ...(data?.rates.map((r) => r.currency) ?? [])]);
  const sourceLabel = { manual: 'manual', ecb: 'ECB', fixed: 'fixed', default: 'not set' } as const;

  return (
    <Section
      title="Currencies & exchange rates"
      description={`How much 1 unit of each currency is worth in ${user.baseCurrency}. Used to convert totals and statistics.`}
    >
      {!data?.rates.length ? (
        <p className="text-sm text-muted-foreground">
          All your accounts use {user.baseCurrency}. Add an account in another currency, or track
          one below.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {data.rates.map((r) => (
            <div key={r.currency} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="w-28">
                <span className="block text-sm font-semibold">{r.currency}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {getCurrency(r.currency).name}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">1 {r.currency} =</span>
              <Input
                className="h-9 w-32"
                inputMode="decimal"
                value={drafts[r.currency] ?? ''}
                onChange={(e) =>
                  setDrafts({ ...drafts, [r.currency]: e.target.value.replace(',', '.') })
                }
                aria-label={`Rate for ${r.currency}`}
              />
              <span className="text-sm text-muted-foreground">{user.baseCurrency}</span>
              <span className="ml-auto flex items-center gap-2">
                <Badge
                  tone={
                    r.source === 'default' ? 'warning' : r.source === 'manual' ? 'info' : 'neutral'
                  }
                >
                  {sourceLabel[r.source]}
                </Badge>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {formatDistanceToNow(parseISO(r.updatedAt), { addSuffix: true })}
                </span>
                {!data.usedCurrencies.includes(r.currency) && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Stop tracking ${r.currency}`}
                    onClick={() => removeCur.mutate(r.currency)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </span>
              <span className="w-full text-xs text-muted-foreground sm:hidden">
                1 {user.baseCurrency} = {numberFmt(1 / (Number(drafts[r.currency]) || r.rate), 4)}{' '}
                {r.currency}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          disabled={!dirty.length}
          loading={setRates.isPending}
          onClick={() =>
            setRates.mutate(
              dirty
                .map((r) => ({ currency: r.currency, rate: Number(drafts[r.currency]) }))
                .filter((r) => Number.isFinite(r.rate) && r.rate > 0),
              {
                onSuccess: () => toast.success('Exchange rates saved'),
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          Save rates
        </Button>
        <Button
          variant="outline"
          loading={refresh.isPending}
          onClick={() =>
            refresh.mutate(false, {
              onSuccess: () => toast.success('Rates updated from the European Central Bank'),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          <RefreshCw /> Update from ECB
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={newCurrency}
            onChange={(e) => setNewCurrency(e.target.value)}
            containerClassName="w-44"
            aria-label="Currency to track"
          >
            <option value="">Track currency…</option>
            {CURRENCIES.filter((c) => !tracked.has(c.code)).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} – {c.name}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            disabled={!newCurrency}
            onClick={() => add.mutate(newCurrency, { onSuccess: () => setNewCurrency('') })}
          >
            Add
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Automatic updates use the free daily reference rates of the European Central Bank. Rates you
        edit by hand are kept until you update them again.
      </p>
    </Section>
  );
}

function SecuritySection() {
  const user = useUser();
  const change = useChangePassword();
  const { data: sessions = [] } = useSessions();
  const revoke = useRevokeSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  return (
    <Section title="Security">
      {user.isDemo ? (
        <p className="text-sm text-muted-foreground">
          The password of the demo account cannot be changed.
        </p>
      ) : (
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate(
              { currentPassword: current, newPassword: next },
              {
                onSuccess: () => {
                  toast.success('Password changed – other sessions were signed out');
                  setCurrent('');
                  setNext('');
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            );
          }}
        >
          <Field label="Current password" htmlFor="pw-cur">
            <Input
              id="pw-cur"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </Field>
          <Field label="New password" htmlFor="pw-new">
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </form>
      )}
      <h3 className="mb-2 mt-6 text-sm font-semibold">Active sessions</h3>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {sessions
          .filter((s) => !s.name)
          .map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              <Laptop className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{describeAgent(s.userAgent)}</p>
                <p className="text-xs text-muted-foreground">
                  {s.ip ?? 'unknown IP'} · active{' '}
                  {formatDistanceToNow(parseISO(s.lastUsedAt), { addSuffix: true })}
                </p>
              </div>
              {s.current ? (
                <Badge tone="success">this device</Badge>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
      </ul>
    </Section>
  );
}

function describeAgent(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

function ApiTokensSection() {
  const user = useUser();
  const { data: sessions = [] } = useSessions();
  const { data: accounts = [] } = useAccounts();
  const create = useCreateToken();
  const revoke = useRevokeSession();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const tokens = sessions.filter((s) => s.name);
  if (user.isDemo) return null;
  const origin = window.location.origin;
  const example = created
    ? `curl -X POST ${origin}/api/records \\
  -H "Authorization: Bearer ${created.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"expense","accountId":"${accounts[0]?.id ?? '<account id>'}","amount":1250,"occurredAt":"${new Date().toISOString()}","note":"Coffee"}'`
    : '';
  return (
    <Section
      title="API tokens"
      description="Let scripts, phone automations (iOS Shortcuts, Tasker) or apps use your data via the API."
    >
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(name, {
            onSuccess: (t) => {
              setCreated(t);
              setName('');
            },
            onError: (err) => toast.error(errorMessage(err)),
          });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name, e.g. “iPhone Shortcut”"
          className="max-w-xs"
          required
          maxLength={60}
        />
        <Button type="submit" variant="outline" loading={create.isPending}>
          <KeyRound /> Create token
        </Button>
      </form>
      {tokens.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
              <KeyRound className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  Created {formatDistanceToNow(parseISO(t.createdAt), { addSuffix: true })} · last
                  used {formatDistanceToNow(parseISO(t.lastUsedAt), { addSuffix: true })}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => revoke.mutate(t.id)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        See the{' '}
        <a
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          API documentation
        </a>{' '}
        for all endpoints. Amounts are in cents (1250 = 12.50).
      </p>
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        {created && (
          <DialogContent
            size="lg"
            title={`Token “${created.name}” created`}
            description="Copy it now – it will not be shown again."
          >
            <div className="grid gap-4">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={created.token}
                  className="font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(created.token);
                    toast.success('Token copied');
                  }}
                >
                  <Copy /> Copy
                </Button>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">Example: add an expense</p>
                <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs leading-relaxed">
                  {example}
                </pre>
              </div>
              {accounts.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-medium">Your account IDs</p>
                  <ul className="grid gap-1 text-xs">
                    {accounts.map((a) => (
                      <li
                        key={a.id}
                        className="flex justify-between gap-3 rounded-lg bg-muted/60 px-2.5 py-1.5"
                      >
                        <span>{a.name}</span>
                        <code className="truncate text-muted-foreground">{a.id}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Section>
  );
}

function DataSection() {
  return (
    <Section
      title="Your data"
      description="Download everything you have entered. Your data never leaves your server."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            downloadUrl(`/api/export/records.csv?tz=${encodeURIComponent(browserTimeZone())}`)
          }
        >
          <Download /> Records (CSV)
        </Button>
        <Button variant="outline" onClick={() => downloadUrl('/api/export/backup.json')}>
          <FileJson /> Full backup (JSON)
        </Button>
        <Button variant="outline" asChild>
          <Link to="/import">
            <FileUp /> Import from CSV
          </Link>
        </Button>
      </div>
    </Section>
  );
}

function DangerSection() {
  const user = useUser();
  const del = useDeleteAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  if (user.isDemo) return null;
  return (
    <Card className="border-destructive/30">
      <CardHeader
        title="Delete account"
        description="Permanently delete your user and all of your data."
      />
      <div className="px-5 pb-5 pt-2">
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 /> Delete my account
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="sm"
          title="Delete your account?"
          description="All accounts, records, budgets and settings will be removed forever."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              del.mutate(password, {
                onSuccess: () => navigate('/login'),
                onError: (err) => toast.error(errorMessage(err)),
              });
            }}
          >
            <Field label="Confirm with your password" htmlFor="del-pw">
              <Input
                id="del-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={del.isPending}>
                Delete everything
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function SettingsPage() {
  const { data: config } = useServerConfig();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <div className="grid gap-6">
        <ProfileSection />
        <PreferencesSection />
        <CurrenciesSection />
        <SecuritySection />
        <ApiTokensSection />
        <DataSection />
        <DangerSection />
        <p className="flex flex-wrap items-center justify-center gap-4 pb-4 text-xs text-muted-foreground">
          <span>Slavotax {config?.version}</span>
          <a
            href="https://github.com/MrNechev/slavotax"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Code className="size-3.5" /> Source code
          </a>
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <BookOpen className="size-3.5" /> API documentation
          </a>
        </p>
      </div>
    </div>
  );
}
