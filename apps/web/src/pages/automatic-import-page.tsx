import type {
  Account,
  AutomaticImportState,
  BankConnection,
  CreatedNotificationSource,
  NotificationApp,
} from '@dostotinka/shared';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FileKey,
  Inbox,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  useAccounts,
  useAutomaticImport,
  useBanks,
  useConnectBank,
  useCreatePhone,
  useDeleteBankConnection,
  useDeleteBankCredentials,
  useDeleteNotificationApp,
  useDeletePhone,
  useFinishBank,
  useSaveBankCredentials,
  useServerConfig,
  useSetAutoImport,
  useSyncBank,
  useUpdateBankAccount,
  useUpdateBankConnection,
  useUpdateNotificationApp,
  useUpdatePhone,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge, Card, CardHeader, PageHeader, Spinner, Switch } from '@/components/ui/misc';
import { t } from '@/i18n';
import { ago } from '@/lib/date';
import { longDate, money } from '@/lib/format';
import { type NativeInfo, nativeApp, useNativeInfo } from '@/lib/native-app';
import { cn } from '@/lib/utils';

const COUNTRIES = [
  'BG',
  'AT',
  'BE',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IS',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'GB',
];

const EB_SITE = 'enablebanking.com';
const APP_ID_EXAMPLE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CALLBACK_EXAMPLE = 'https://localhost/dostotinka-bank-callback?state=…&code=…';

function countryName(code: string) {
  try {
    return (
      new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'region' }).of(code) ??
      code
    );
  } catch {
    return code;
  }
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
  toast.success(t('Copied'));
}

function CopyField({ value, label }: { value: string; label?: string }) {
  return (
    <div>
      {label && <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          className="font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => copy(value)}
          aria-label={t('Copy')}
          title={t('Copy')}
        >
          <Copy />
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </li>
  );
}

function AccountSelect({
  value,
  accounts,
  onChange,
  label,
}: {
  value: string | null;
  accounts: Account[];
  onChange: (id: string | null) => void;
  label: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t('Choose an account')}</option>
      {accounts
        .filter((a) => !a.archived || a.id === value)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.currency})
          </option>
        ))}
    </Select>
  );
}

// ───────────────────────────── Phone notifications ─────────────────────────────

function PhoneInstructions({ created }: { created: CreatedNotificationSource }) {
  const url = `${window.location.origin}/api/ingest/notification`;
  const header = `Bearer ${created.token}`;
  const test = `curl -X POST ${url} \\
  -H "Authorization: ${header}" \\
  -d app=Test -d title=Shop -d "text=Paid €1.00 at Test shop"`;
  return (
    <div className="grid gap-4 text-sm">
      <p className="rounded-xl bg-warning/10 p-3 text-xs">
        {t(
          'Copy the token now – it will not be shown again. It can only add notifications, nothing else.',
        )}
      </p>
      <CopyField label={t('Address (URL)')} value={url} />
      <CopyField label={t('Header “Authorization”')} value={header} />
      <div>
        <p className="mb-1 font-medium">{t('Android with MacroDroid')}</p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            {t(
              'Trigger: “Notification received” – choose your banking apps and Google Wallet (or “SMS received” for SMS from the bank).',
            )}
          </li>
          <li>{t('Action: “HTTP request”, method POST, the address above, the header above.')}</li>
          <li>
            {t(
              'Request body: form fields app, title and text – fill them with the notification’s app name, title and text via the “…” (magic text) button. For SMS put the message into text and SMS into app.',
            )}
          </li>
        </ol>
      </div>
      <div>
        <p className="mb-1 font-medium">{t('Android with Tasker')}</p>
        <p className="text-muted-foreground">
          {t(
            'Profile with the event “Notification” for your banking apps, task “HTTP Request” (POST) with the same address and header and the body app=…&title=…&text=… (type application/x-www-form-urlencoded) filled with the event values %evtprm1, %evtprm2, %evtprm3 – their order differs between Tasker versions, flash %evtprm() once to check.',
          )}
        </p>
      </div>
      <div>
        <p className="mb-1 font-medium">{t('iPhone with Shortcuts')}</p>
        <p className="text-muted-foreground">
          {t(
            'Automation “Transaction” (Wallet): action “Get Contents of URL”, method POST, the address and header above, request body “Form” with merchant = Merchant, amount = Amount and app = Card. Works for Apple Pay payments.',
          )}
        </p>
      </div>
      <div>
        <p className="mb-1 font-medium">{t('Test it from a computer')}</p>
        <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs leading-relaxed">
          {test}
        </pre>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'Notifications from your phone go only to your own DoStotinka server. Every app that sends one appears below – choose its account there.',
        )}
      </p>
    </div>
  );
}

function AppRow({ app, accounts }: { app: NotificationApp; accounts: Account[] }) {
  const update = useUpdateNotificationApp();
  const remove = useDeleteNotificationApp();
  const onError = (e: unknown) => toast.error(errorMessage(e));
  return (
    <li className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_14rem_auto] sm:items-center">
      <div className="min-w-0">
        <p
          className={cn(
            'truncate text-sm font-medium',
            !app.enabled && 'text-muted-foreground line-through',
          )}
        >
          {app.label}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {app.label !== app.app ? `${app.app} · ` : ''}
          {t('last notification {when}', { when: ago(app.lastSeenAt) })}
        </p>
      </div>
      <AccountSelect
        label={t('Account')}
        value={app.accountId}
        accounts={accounts}
        onChange={(accountId) => update.mutate({ id: app.id, accountId }, { onError })}
      />
      <div className="flex items-center justify-end gap-2">
        <Switch
          checked={app.enabled}
          onCheckedChange={(enabled) => update.mutate({ id: app.id, enabled }, { onError })}
          aria-label={t('Import notifications of this app')}
          title={t('Import notifications of this app')}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('Forget this app')}
          title={t('Forget this app')}
          onClick={() => remove.mutate(app.id, { onError })}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

/** Shown inside the Android app: forwards this phone's notifications without extra apps. */
function ThisPhoneCard({ state }: { state: AutomaticImportState }) {
  const [info, refresh] = useNativeInfo();
  const create = useCreatePhone();
  const deletePhone = useDeletePhone();
  if (!nativeApp || !info) return null;
  const bridge = nativeApp;
  const known = info.connected && state.sources.some((s) => s.id === info.sourceId);
  if (info.platform === 'ios') {
    return (
      <ThisIPhone
        info={info}
        known={known}
        connecting={create.isPending}
        onConnect={() =>
          create.mutate(info.device, {
            onSuccess: (c) => {
              if (bridge.connect(c.token, c.id, c.name)) {
                toast.success(t('This iPhone can now send card payments'));
              }
              refresh();
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
        onStop={() => {
          if (info.sourceId) deletePhone.mutate(info.sourceId);
          bridge.disconnect();
          refresh();
        }}
        onOpenShortcuts={() => bridge.openShortcuts?.()}
      />
    );
  }
  const removed = info.connected && !known;
  const watched = new Set(info.watched);
  const toggle = (app: string, on: boolean) => {
    const next = new Set(watched);
    if (on) next.add(app);
    else next.delete(app);
    bridge.setWatched(JSON.stringify([...next]));
    refresh();
  };
  const connect = () =>
    create.mutate(info.device, {
      onSuccess: (c) => {
        if (bridge.connect(c.token, c.id, c.name)) {
          toast.success(t('This phone now sends payment notifications'));
        }
        refresh();
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <div className="grid gap-3 rounded-xl border border-primary/40 bg-primary-soft/40 p-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Smartphone className="size-4" /> {t('This phone')}
        </p>
        <p className="truncate pl-6 text-xs text-muted-foreground">{info.device}</p>
      </div>
      {!info.connected || removed ? (
        <div className="grid gap-2 text-sm">
          <p className="text-muted-foreground">
            {removed
              ? t('This phone was removed in DoStotinka. Connect it again to keep importing.')
              : t(
                  'The DoStotinka app can read the payment notifications of your banking apps itself – no other app needed.',
                )}
          </p>
          <div>
            <Button size="sm" loading={create.isPending} onClick={connect}>
              {t('Use this phone')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {t('Notification access')}{' '}
              {info.notificationAccess ? (
                <Badge tone="success">{t('allowed')}</Badge>
              ) : (
                <Badge tone="danger">{t('not allowed')}</Badge>
              )}
            </span>
            {!info.notificationAccess && (
              <Button size="sm" onClick={() => bridge.openNotificationAccess()}>
                {t('Allow notification access')}
              </Button>
            )}
          </div>
          {!info.notificationAccess && (
            <p className="text-xs text-muted-foreground">
              {t(
                'If Android says the setting is restricted: open the app info, tap ⋮ (top right) and choose “Allow restricted settings”, then try again.',
              )}{' '}
              <button
                type="button"
                className="cursor-pointer font-medium text-primary hover:underline"
                onClick={() => bridge.openAppInfo()}
              >
                {t('Open app info')}
              </button>
            </p>
          )}
          <div>
            <p className="mb-1 text-sm font-medium">{t('Forward notifications of')}</p>
            {info.recent.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                {t(
                  'Apps appear here after they showed a notification on this phone – e.g. after your next card payment.',
                )}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {info.recent.map((r) => (
                  <li key={r.app}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{r.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.app}
                        </span>
                      </span>
                      <Switch
                        checked={watched.has(r.app)}
                        onCheckedChange={(on) => toggle(r.app, on)}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                'Only the chosen apps are forwarded; of all others the app keeps nothing but their name.',
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {info.sentCount > 0
                ? t('{n} notifications sent, the last {when}', {
                    n: info.sentCount,
                    when: ago(new Date(info.lastSentAt)),
                  })
                : t('Nothing sent yet')}
              {info.lastError && <span className="text-destructive"> · {info.lastError}</span>}
            </span>
            <Button
              size="xs"
              variant="destructive-ghost"
              onClick={() => {
                if (info.sourceId) deletePhone.mutate(info.sourceId);
                bridge.disconnect();
                refresh();
              }}
            >
              {t('Stop using this phone')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Inside the iPhone app: iOS does not let apps read notifications – instead the Wallet
 * "Transaction" automation of the Shortcuts app passes every card payment to the app.
 */
function ThisIPhone({
  info,
  known,
  connecting,
  onConnect,
  onStop,
  onOpenShortcuts,
}: {
  info: NativeInfo;
  known: boolean;
  connecting: boolean;
  onConnect: () => void;
  onStop: () => void;
  onOpenShortcuts: () => void;
}) {
  const removed = info.connected && !known;
  return (
    <div className="grid gap-3 rounded-xl border border-primary/40 bg-primary-soft/40 p-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Smartphone className="size-4" /> {t('This iPhone')}
        </p>
        <p className="truncate pl-6 text-xs text-muted-foreground">{info.device}</p>
      </div>
      {!info.connected || removed ? (
        <div className="grid gap-2 text-sm">
          <p className="text-muted-foreground">
            {removed
              ? t('This iPhone was removed in DoStotinka. Connect it again to keep importing.')
              : t(
                  'Card payments can arrive by themselves: an automation of the Shortcuts app passes every Apple Pay payment to DoStotinka.',
                )}
          </p>
          <div>
            <Button size="sm" loading={connecting} onClick={onConnect}>
              {t('Use this iPhone')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ol className="grid gap-1.5 pl-5 text-sm [list-style:decimal]">
            <li>{t('Open the Shortcuts app → Automation → New automation.')}</li>
            <li>{t('Choose “Transaction” (Wallet), select your cards and “Run immediately”.')}</li>
            <li>
              {t(
                'Add the action “Add payment to DoStotinka” and fill in Amount, Merchant and Card from the transaction.',
              )}
            </li>
          </ol>
          <div>
            <Button size="sm" variant="outline" onClick={onOpenShortcuts}>
              {t('Open Shortcuts')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'Each card appears as its own app below – choose the account it belongs to. Payments that cannot be sent wait on the iPhone.',
            )}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {info.sentCount > 0
                ? t('{n} payments sent, the last {when}', {
                    n: info.sentCount,
                    when: ago(new Date(info.lastSentAt)),
                  })
                : t('Nothing sent yet')}
              {!!info.pending && ` · ${t('{n} waiting', { n: info.pending })}`}
              {info.lastError && <span className="text-destructive"> · {info.lastError}</span>}
            </span>
            <Button size="xs" variant="destructive-ghost" onClick={onStop}>
              {t('Stop using this iPhone')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationsSection({
  state,
  accounts,
}: {
  state: AutomaticImportState;
  accounts: Account[];
}) {
  const setEnabled = useSetAutoImport();
  const create = useCreatePhone();
  const updatePhone = useUpdatePhone();
  const deletePhone = useDeletePhone();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedNotificationSource | null>(null);
  const onError = (e: unknown) => toast.error(errorMessage(e));

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Smartphone className="size-4" /> {t('Payment notifications from your phone')}
          </span>
        }
        description={t(
          'Instant: your phone forwards the notifications of your banking apps, Google Wallet or bank SMS, DoStotinka reads amount and shop.',
        )}
        action={
          <Switch
            checked={state.notificationsEnabled}
            onCheckedChange={(notificationsEnabled) =>
              setEnabled.mutate({ notificationsEnabled }, { onError })
            }
            aria-label={t('Payment notifications from your phone')}
          />
        }
      />
      {state.notificationsEnabled && (
        <div className="grid gap-5 px-5 pt-2 pb-5">
          <ThisPhoneCard state={state} />
          <div>
            <p className="mb-2 text-sm font-medium">{t('Phones')}</p>
            {state.sources.length > 0 && (
              <ul className="mb-3 divide-y divide-border rounded-xl border border-border">
                {state.sources.map((s) => (
                  <li key={s.id} className="grid gap-2 px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Smartphone className="size-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.lastReceivedAt
                            ? t('last notification {when}', { when: ago(s.lastReceivedAt) })
                            : t('nothing received yet')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('Remove phone')}
                        title={t('Remove phone')}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: t('Remove “{name}”?', { name: s.name }),
                              description: t('Its token stops working immediately.'),
                              confirmLabel: t('Remove'),
                              destructive: true,
                            })
                          )
                            deletePhone.mutate(s.id, { onError });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <ToggleRow
                      title={t('Active')}
                      checked={s.enabled}
                      onChange={(enabled) => updatePhone.mutate({ id: s.id, enabled }, { onError })}
                    />
                    <ToggleRow
                      title={t('Add records without review')}
                      description={t(
                        'Only when the account is known and nothing looks like a duplicate or transfer.',
                      )}
                      checked={s.autoConfirm}
                      onChange={(autoConfirm) =>
                        updatePhone.mutate({ id: s.id, autoConfirm }, { onError })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(name || t('My phone'), {
                  onSuccess: (c) => {
                    setCreated(c);
                    setName('');
                  },
                  onError,
                });
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('Name, e.g. “My phone”')}
                maxLength={60}
                className="max-w-xs"
              />
              <Button type="submit" variant="outline" loading={create.isPending}>
                <Plus /> {t('Add phone')}
              </Button>
            </form>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">{t('Apps')}</p>
            <p className="mb-2 text-xs text-muted-foreground">
              {t(
                'Every app that sent a notification. Choose the account its payments belong to – or switch the app off.',
              )}
            </p>
            {state.apps.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {state.apps.map((a) => (
                  <AppRow key={a.id} app={a} accounts={accounts} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                {t('No notifications received yet.')}
              </p>
            )}
          </div>
        </div>
      )}
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        {created && (
          <DialogContent
            size="lg"
            title={t('Set up “{name}”', { name: created.name })}
            description={t('Tell your phone to send payment notifications to DoStotinka.')}
          >
            <PhoneInstructions created={created} />
            <DialogFooter>
              <Button onClick={() => setCreated(null)}>{t('Done')}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

// ───────────────────────────── Open banking ─────────────────────────────

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function BankSetup() {
  const save = useSaveBankCredentials();
  const [appId, setAppId] = useState('');
  const [key, setKey] = useState('');
  const [fileName, setFileName] = useState('');
  const own = `${window.location.origin}/bank-callback`;
  const https = window.location.protocol === 'https:';
  const fallback = 'https://localhost/dostotinka-bank-callback';
  return (
    <div className="grid gap-4">
      <ol className="grid gap-3">
        <Step n={1}>
          {t('Create a free account at Enable Banking')}{' '}
          <a
            href="https://enablebanking.com/sign-in/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            {EB_SITE} <ExternalLink className="size-3" />
          </a>
        </Step>
        <Step n={2}>
          <p>
            {t(
              'In its control panel register a new application: environment “Production”, key “Generate in the browser” (a .pem file is downloaded). As redirect URL enter:',
            )}
          </p>
          <div className="mt-2">
            <CopyField value={https ? own : fallback} />
          </div>
          {!https && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t(
                'Enable Banking only accepts https addresses. Because DoStotinka is opened over http here, use this address – after confirming at the bank you paste the address of the page you land on into DoStotinka. With https (e.g. a reverse proxy) use {url} instead and everything happens automatically.',
                { url: `https://…/bank-callback` },
              )}
            </p>
          )}
        </Step>
        <Step n={3}>
          {t(
            'Click “Activate by linking accounts” and log in to your banks there. In the free mode only accounts linked this way can be read.',
          )}
        </Step>
        <Step n={4}>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(
                { applicationId: appId.trim(), privateKey: key },
                {
                  onSuccess: (r) =>
                    toast.success(
                      r.environment === 'SANDBOX'
                        ? t('Saved – this is a sandbox application with test banks only')
                        : t('Saved – now connect your bank'),
                    ),
                  onError: (err) => toast.error(errorMessage(err)),
                },
              );
            }}
          >
            <p>{t('Enter the application ID and choose the downloaded .pem file:')}</p>
            <Field label={t('Application ID')} htmlFor="eb-app">
              <Input
                id="eb-app"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder={APP_ID_EXAMPLE}
                required
                className="font-mono text-xs"
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input p-3 text-sm hover:bg-muted">
              <FileKey className="size-5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {fileName || t('Choose the private key (.pem)')}
              </span>
              <input
                type="file"
                accept=".pem,.key,application/x-pem-file,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await readFile(file);
                  setKey(text);
                  setFileName(file.name);
                  // The downloaded file is named after the application ID.
                  const id = file.name.match(
                    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
                  )?.[0];
                  if (id && !appId) setAppId(id);
                }}
              />
            </label>
            <div>
              <Button type="submit" loading={save.isPending} disabled={!appId || !key}>
                {t('Save and check')}
              </Button>
            </div>
          </form>
        </Step>
      </ol>
      <p className="flex gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        {t(
          'Your bank password is never entered in DoStotinka – you confirm read-only access in your banking app. The key is stored encrypted on your server. Transactions go from the bank via Enable Banking (a licensed EU provider) directly to your server.',
        )}
      </p>
    </div>
  );
}

/** Lets the user paste the address of the page the bank sent them to (http installs). */
function PasteCallbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const finish = useFinishBank();
  const [value, setValue] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="md"
        title={t('Finish connecting')}
        description={t(
          'After confirming at the bank you land on a page that may not load. Copy its complete address from the address bar and paste it here.',
        )}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            let params: URLSearchParams;
            try {
              params = new URL(value.trim()).searchParams;
            } catch {
              toast.error(t('This is not a complete address'));
              return;
            }
            const state = params.get('state');
            if (!state) {
              toast.error(t('The address contains no state – copy the whole address'));
              return;
            }
            finish.mutate(
              {
                state,
                code: params.get('code') ?? undefined,
                error: params.get('error') ?? undefined,
                errorDescription: params.get('error_description') ?? undefined,
              },
              {
                onSuccess: () => {
                  toast.success(t('Bank connected'));
                  setValue('');
                  onClose();
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            );
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={CALLBACK_EXAMPLE}
            className="font-mono text-xs"
            required
          />
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={finish.isPending}>
              {t('Connect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useStartBank() {
  const connect = useConnectBank();
  const [pasting, setPasting] = useState(false);
  const start = (body: { bankName: string; country: string; renewConnectionId?: string }) =>
    connect.mutate(body, {
      onSuccess: (r) => {
        if (r.redirectUrl.startsWith(`${window.location.origin}/`)) {
          window.location.href = r.url;
        } else {
          window.open(r.url, '_blank', 'noopener');
          setPasting(true);
        }
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  return { start, pending: connect.isPending, pasting, closePaste: () => setPasting(false) };
}

function ConnectBank() {
  const [country, setCountry] = useState('BG');
  const [bank, setBank] = useState('');
  const { data: banks = [], isLoading, error } = useBanks(country);
  const { start, pending, pasting, closePaste } = useStartBank();
  return (
    <div className="grid gap-3 rounded-xl border border-border p-3">
      <p className="text-sm font-medium">{t('Connect a bank')}</p>
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
        <Select
          aria-label={t('Country')}
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setBank('');
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {countryName(c)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('Bank')}
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          disabled={isLoading}
        >
          <option value="">{isLoading ? t('Loading…') : t('Choose your bank')}</option>
          {banks.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </Select>
        <Button
          disabled={!bank}
          loading={pending}
          onClick={() => start({ bankName: bank, country })}
        >
          {t('Connect')}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
      <PasteCallbackDialog open={pasting} onClose={closePaste} />
    </div>
  );
}

const STATUS: Record<
  BankConnection['status'],
  { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }
> = {
  active: { label: t('Connected'), tone: 'success' },
  expired: { label: t('Access expired'), tone: 'danger' },
  error: { label: t('Error'), tone: 'danger' },
  pending: { label: t('Waiting for the bank'), tone: 'warning' },
};

function ConnectionCard({
  connection,
  accounts,
}: {
  connection: BankConnection;
  accounts: Account[];
}) {
  const update = useUpdateBankConnection();
  const updateAccount = useUpdateBankAccount();
  const sync = useSyncBank();
  const remove = useDeleteBankConnection();
  const confirm = useConfirm();
  const { start, pending, pasting, closePaste } = useStartBank();
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const status = STATUS[connection.status];
  const daysLeft = connection.validUntil
    ? Math.ceil((new Date(connection.validUntil).getTime() - Date.now()) / 86_400_000)
    : null;
  const renewable = connection.status !== 'active' || (daysLeft !== null && daysLeft <= 14);

  return (
    <div className="rounded-xl border border-border">
      <div className="flex flex-wrap items-start gap-3 p-3">
        <Landmark className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {connection.bankName} <Badge tone={status.tone}>{status.label}</Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            {connection.validUntil &&
              t('access until {date}', { date: longDate(connection.validUntil) })}
            {connection.lastSyncAt &&
              ` · ${t('last update {when}', { when: ago(connection.lastSyncAt) })}`}
          </p>
          {connection.lastError && (
            <p className="mt-1 text-xs text-destructive">{connection.lastError}</p>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {renewable && (
            <Button
              size="sm"
              variant={connection.status === 'active' ? 'outline' : 'default'}
              loading={pending}
              onClick={() =>
                start({
                  bankName: connection.bankName,
                  country: connection.bankCountry,
                  renewConnectionId: connection.id,
                })
              }
            >
              {t('Renew access')}
            </Button>
          )}
          {connection.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              loading={sync.isPending}
              onClick={() =>
                sync.mutate(connection.id, {
                  onSuccess: (r) =>
                    toast.success(
                      r.duplicates
                        ? t('{n} new transactions in the inbox, {d} already known', {
                            n: r.imported,
                            d: r.duplicates,
                          })
                        : t('{n} new transactions in the inbox', { n: r.imported }),
                    ),
                  onError,
                })
              }
            >
              <RefreshCw /> {t('Update now')}
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('Disconnect')}
            title={t('Disconnect')}
            onClick={async () => {
              if (
                await confirm({
                  title: t('Disconnect {bank}?', { bank: connection.bankName }),
                  description: t(
                    'The access is ended at the bank. Records that were already added stay.',
                  ),
                  confirmLabel: t('Disconnect'),
                  destructive: true,
                })
              )
                remove.mutate(connection.id, { onError });
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {connection.accounts.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {connection.accounts.map((a) => {
            const linked = accounts.find((x) => x.id === a.accountId);
            return (
              <li key={a.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_14rem] sm:items-center">
                <div className="min-w-0">
                  <p
                    className={cn(
                      'truncate text-sm font-medium',
                      !a.enabled && 'text-muted-foreground line-through',
                    )}
                  >
                    {a.name || t('Account')}{' '}
                    {a.currency && <span className="text-muted-foreground">· {a.currency}</span>}
                  </p>
                  {a.iban && (
                    <p className="truncate font-mono text-xs text-muted-foreground">{a.iban}</p>
                  )}
                  {a.balance !== null && a.currency && (
                    <p className="text-xs text-muted-foreground">
                      {t('Bank balance {amount}', { amount: money(a.balance, a.currency) })}
                      {linked && linked.currency === a.currency && linked.balance !== a.balance && (
                        <span className="text-warning">
                          {' · '}
                          {t('DoStotinka: {amount}', {
                            amount: money(linked.balance, linked.currency),
                          })}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <AccountSelect
                  label={t('DoStotinka account')}
                  value={a.accountId}
                  accounts={accounts}
                  onChange={(accountId) =>
                    updateAccount.mutate({ id: a.id, accountId }, { onError })
                  }
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    {t('Import from')}
                    <Input
                      type="date"
                      value={a.importFrom}
                      onChange={(e) =>
                        e.target.value &&
                        updateAccount.mutate({ id: a.id, importFrom: e.target.value }, { onError })
                      }
                      className="h-8 w-40 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={a.enabled}
                      onCheckedChange={(enabled) =>
                        updateAccount.mutate({ id: a.id, enabled }, { onError })
                      }
                    />
                    {t('Import this account')}
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid gap-2 border-t border-border p-3">
        <ToggleRow
          title={t('Active')}
          description={t('Fetches new transactions up to four times a day.')}
          checked={connection.enabled}
          onChange={(enabled) => update.mutate({ id: connection.id, enabled }, { onError })}
        />
        <ToggleRow
          title={t('Add records without review')}
          description={t('Only when nothing looks like a duplicate or transfer.')}
          checked={connection.autoConfirm}
          onChange={(autoConfirm) => update.mutate({ id: connection.id, autoConfirm }, { onError })}
        />
      </div>
      <PasteCallbackDialog open={pasting} onClose={closePaste} />
    </div>
  );
}

function BankSection({ state, accounts }: { state: AutomaticImportState; accounts: Account[] }) {
  const setEnabled = useSetAutoImport();
  const removeCreds = useDeleteBankCredentials();
  const confirm = useConfirm();
  const [pasting, setPasting] = useState(false);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const manual = !state.bank.redirectUrl.startsWith(`${window.location.origin}/`);
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Landmark className="size-4" /> {t('Bank connection (open banking)')}
          </span>
        }
        description={t(
          'Complete: transactions, fees and balances come straight from your bank (DSK, UBB, Revolut and 2,500+ European banks) through Enable Banking.',
        )}
        action={
          <Switch
            checked={state.bankEnabled}
            onCheckedChange={(bankEnabled) => setEnabled.mutate({ bankEnabled }, { onError })}
            aria-label={t('Bank connection (open banking)')}
          />
        }
      />
      {state.bankEnabled && (
        <div className="grid gap-4 px-5 pt-2 pb-5">
          {!state.bank.configured ? (
            <BankSetup />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 p-3 text-xs">
                <span className="min-w-0">
                  <span className="text-muted-foreground">{t('Enable Banking application')}</span>{' '}
                  <code className="break-all">{state.bank.applicationId}</code>
                  <br />
                  <span className="text-muted-foreground">{t('Redirect URL')}</span>{' '}
                  <code className="break-all">{state.bank.redirectUrl}</code>
                </span>
                <div className="flex gap-2">
                  {manual && (
                    <Button size="xs" variant="outline" onClick={() => setPasting(true)}>
                      {t('Paste the address from the bank')}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="destructive-ghost"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: t('Remove the Enable Banking application?'),
                          description: t(
                            'All bank connections are disconnected. Records that were already added stay.',
                          ),
                          confirmLabel: t('Remove'),
                          destructive: true,
                        })
                      )
                        removeCreds.mutate(undefined, { onError });
                    }}
                  >
                    {t('Remove')}
                  </Button>
                </div>
              </div>
              {state.bank.connections.map((c) => (
                <ConnectionCard key={c.id} connection={c} accounts={accounts} />
              ))}
              <ConnectBank />
            </>
          )}
        </div>
      )}
      <PasteCallbackDialog open={pasting} onClose={() => setPasting(false)} />
    </Card>
  );
}

export default function AutomaticImportPage() {
  const user = useUser();
  const { data: config } = useServerConfig();
  const available = config?.automaticImport !== false && !user.isDemo;
  const { data: state, isLoading } = useAutomaticImport(available);
  const { data: accounts = [] } = useAccounts();

  useEffect(() => {
    document.title = `${t('Automatic import')} · DoStotinka`;
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('Automatic import')}
        description={t(
          'Records can arrive on their own – both ways can be used together. New transactions wait in the inbox until you confirm them.',
        )}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/inbox">
              <Inbox /> {t('Inbox')}
            </Link>
          </Button>
        }
      />
      {!available ? (
        <Card className="p-5 text-sm text-muted-foreground">
          {user.isDemo
            ? t('Automatic import is not available in the shared demo account.')
            : t('Automatic import is switched off on this server.')}
        </Card>
      ) : isLoading || !state ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-6">
          <NotificationsSection state={state} accounts={accounts} />
          <BankSection state={state} accounts={accounts} />
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/settings" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3.5" /> {t('Settings')}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
