import { KeyRound, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError, errorMessage } from '@/api/client';
import { useDemoLogin, useLogin, useServerConfig } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { t } from '@/i18n';
import { AuthLayout } from './auth-layout';

/** Message for the `sso_error` the server adds when single sign-on fails. */
function ssoErrorMessage(code: string | null): string | null {
  switch (code) {
    case null:
      return null;
    case 'not_allowed':
      return t('There is no Slavotax account for this login. Ask your administrator to add you.');
    case 'account_exists':
      return t(
        'An account with this e-mail address already exists. Log in with your password and connect single sign-on in Settings → Security.',
      );
    case 'no_email':
      return t('Your login provider did not share an e-mail address.');
    case 'expired':
      return t('The login took too long. Please try again.');
    case 'cancelled':
      return t('The login was cancelled.');
    case 'unavailable':
      return t('The login provider cannot be reached right now.');
    default:
      return t('Single sign-on failed. Please try again.');
  }
}

export function SsoButton({ text }: { text: string }) {
  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> {t('or')}{' '}
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button variant="outline" size="lg" className="w-full" asChild>
        {/* A full page navigation: the server redirects to the login provider. */}
        <a href="/api/auth/oidc/start">
          <KeyRound /> {text === 'Log in with SSO' ? t('Log in with SSO') : text}
        </a>
      </Button>
    </>
  );
}

export function LoginPage() {
  const { data: config } = useServerConfig();
  const login = useLogin();
  const demo = useDemoLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(() => ssoErrorMessage(params.get('sso_error')));
  // Two-factor login: the server asks for the authenticator code after a correct password.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password, ...(needsCode ? { code } : {}) });
      navigate('/', { replace: true });
    } catch (err) {
      const codeIssue = err instanceof ApiError && err.issues[0]?.path === 'code';
      if (codeIssue && !needsCode) {
        setNeedsCode(true);
        return;
      }
      setError(errorMessage(err));
    }
  };

  const tryDemo = async () => {
    setError(null);
    try {
      await demo.mutateAsync();
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold tracking-tight">{t('Welcome back')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('Log in to continue to your budget.')}
      </p>
      <form onSubmit={submit} className="mt-8 grid gap-4">
        <Field label={t('E-mail')} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label={t('Password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {needsCode && (
          <Field
            label={t('Authentication code')}
            htmlFor="code"
            hint={t('Open your authenticator app – or enter one of your recovery codes.')}
          >
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123 456"
              maxLength={20}
              required
              autoFocus
            />
          </Field>
        )}
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" size="lg" loading={login.isPending} className="mt-2">
          {t('Log in')}
        </Button>
      </form>

      {config?.sso.enabled && <SsoButton text={config.sso.buttonText} />}

      {config?.demo.enabled && (
        <>
          {config.sso.enabled ? (
            <div className="h-3" />
          ) : (
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> {t('or')}{' '}
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={tryDemo}
            loading={demo.isPending}
          >
            <Sparkles /> {t('Explore the demo account')}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t('Pre-filled with a year of example data. No sign-up needed.')}
          </p>
        </>
      )}

      {config?.registrationEnabled !== false && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t('New to Slavotax?')}{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            {t('Sign up')}
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
