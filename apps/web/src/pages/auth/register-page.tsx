import { CURRENCIES } from '@slavotax/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, errorMessage } from '@/api/client';
import { useRegister, useServerConfig } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { t } from '@/i18n';
import { AuthLayout } from './auth-layout';

export function RegisterPage() {
  const { data: config } = useServerConfig();
  const register = useRegister();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', baseCurrency: 'EUR' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      await register.mutateAsync(form);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        setFieldErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      }
      setError(errorMessage(err));
    }
  };

  if (config && !config.registrationEnabled) {
    return (
      <AuthLayout>
        <h2 className="text-2xl font-semibold tracking-tight">{t('Registration is closed')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('The administrator of this server has disabled sign-ups.')}
        </p>
        <Button asChild className="mt-6">
          <Link to="/login">{t('Back to login')}</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold tracking-tight">{t('Create your account')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('Start tracking your money in a minute.')}
      </p>
      <form onSubmit={submit} className="mt-8 grid gap-4">
        <Field label={t('Name')} htmlFor="name" error={fieldErrors.name}>
          <Input
            id="name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
          />
        </Field>
        <Field label={t('E-mail')} htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Field>
        <Field
          label={t('Password')}
          htmlFor="password"
          error={fieldErrors.password}
          hint={t('At least 8 characters.')}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </Field>
        <Field
          label={t('Main currency')}
          htmlFor="currency"
          hint={t('Statistics and totals are shown in this currency. You can change it later.')}
        >
          <Select
            id="currency"
            value={form.baseCurrency}
            onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} – {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" size="lg" loading={register.isPending} className="mt-2">
          {t('Sign up')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('Already have an account?')}{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('Log in')}
        </Link>
      </p>
    </AuthLayout>
  );
}
