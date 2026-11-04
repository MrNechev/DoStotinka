import type { TwoFactorSetup } from '@slavotax/shared';
import { Check, Copy, Download, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { renderSVG } from 'uqr';
import { errorMessage } from '@/api/client';
import {
  useDisableTwoFactor,
  useEnableTwoFactor,
  useNewRecoveryCodes,
  useTwoFactorSetup,
  useUser,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { t, tn } from '@/i18n';

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'Keep these recovery codes somewhere safe. Each one lets you log in once without your phone. They are shown only now.',
        )}
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-muted/60 p-4 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              toast.error(t('Copying is not allowed by the browser'));
            }
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? t('Copied') : t('Copy')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'slavotax-recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> {t('Download')}
        </Button>
      </div>
      <DialogFooter className="mt-0">
        <Button onClick={onDone}>{t('Done')}</Button>
      </DialogFooter>
    </div>
  );
}

function SetupDialog({ onClose }: { onClose: () => void }) {
  const start = useTwoFactorSetup();
  const enable = useEnableTwoFactor();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ask the server for a secret once when the dialog opens (the ref survives StrictMode's
  // double effect run, so only one secret is created).
  const requested = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per dialog
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    start.mutate(undefined, {
      onSuccess: setSetup,
      onError: (err) => setError(errorMessage(err)),
    });
  }, []);

  const qr = setup
    ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(setup.otpauthUrl, { border: 2 }))}`
    : null;

  return (
    <DialogContent
      size="sm"
      title={codes ? t('Save your recovery codes') : t('Set up two-factor login')}
    >
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const res = await enable.mutateAsync(code);
              setCodes(res.recoveryCodes);
              toast.success(t('Two-factor login is on'));
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            {t(
              'Scan the code with an authenticator app (e.g. Aegis, 2FAS, Google Authenticator, 1Password) and enter the 6-digit code it shows.',
            )}
          </p>
          <div className="flex justify-center">
            {qr ? (
              <img
                src={qr}
                alt={t('QR code for your authenticator app')}
                className="size-48 rounded-xl border border-border bg-white p-1"
              />
            ) : (
              <div className="size-48 animate-pulse rounded-xl bg-muted" />
            )}
          </div>
          {setup && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t('Can’t scan? Enter the key by hand')}</summary>
              <code className="mt-2 block break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm text-foreground">
                {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
              </code>
            </details>
          )}
          <Field label={t('Code from the app')} htmlFor="totp-code">
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123 456"
              maxLength={7}
              required
              autoFocus
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-0">
            <Button variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={enable.isPending} disabled={!setup}>
              {t('Turn on')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}

/** Asks for the password, then turns two-factor login off or replaces the recovery codes. */
function PasswordDialog({ mode, onClose }: { mode: 'disable' | 'codes'; onClose: () => void }) {
  const disable = useDisableTwoFactor();
  const renew = useNewRecoveryCodes();
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = disable.isPending || renew.isPending;
  return (
    <DialogContent
      size="sm"
      title={
        codes
          ? t('Save your recovery codes')
          : mode === 'disable'
            ? t('Turn off two-factor login')
            : t('New recovery codes')
      }
      description={
        codes
          ? undefined
          : mode === 'disable'
            ? t('Logging in will only need your password again.')
            : t('Your old recovery codes stop working.')
      }
    >
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              if (mode === 'disable') {
                await disable.mutateAsync(password);
                toast.success(t('Two-factor login is off'));
                onClose();
              } else {
                setCodes((await renew.mutateAsync(password)).recoveryCodes);
              }
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <Field label={t('Password')} htmlFor="tf-password">
            <Input
              id="tf-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-0">
            <Button variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              loading={pending}
              variant={mode === 'disable' ? 'destructive' : 'default'}
            >
              {mode === 'disable' ? t('Turn off') : t('Create new codes')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}

/** Two-factor login block of the Security settings. */
export function TwoFactorSettings() {
  const user = useUser();
  const [dialog, setDialog] = useState<'setup' | 'disable' | 'codes' | null>(null);
  if (user.isDemo) return null;
  const close = () => setDialog(null);
  return (
    <div className="mt-6 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {t('Two-factor login')}
            {user.twoFactorEnabled ? (
              <Badge tone="success">{t('On')}</Badge>
            ) : (
              <Badge>{t('Off')}</Badge>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {user.twoFactorEnabled
              ? tn(
                  user.recoveryCodesLeft,
                  'A code from your authenticator app is needed to log in. {n} recovery code left.',
                  'A code from your authenticator app is needed to log in. {n} recovery codes left.',
                )
              : t('Protect your account with a code from an authenticator app on your phone.')}
          </p>
        </div>
        {user.twoFactorEnabled ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialog('codes')}>
              <KeyRound /> {t('New recovery codes')}
            </Button>
            <Button variant="destructive-ghost" size="sm" onClick={() => setDialog('disable')}>
              {t('Turn off')}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setDialog('setup')}>
            {t('Turn on')}
          </Button>
        )}
      </div>
      <Dialog open={!!dialog} onOpenChange={(o) => !o && close()}>
        {dialog === 'setup' && <SetupDialog onClose={close} />}
        {(dialog === 'disable' || dialog === 'codes') && (
          <PasswordDialog mode={dialog} onClose={close} />
        )}
      </Dialog>
    </div>
  );
}
