import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '@/api/client';
import { useDemoLogin, useLogin, useServerConfig } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { AuthLayout } from './auth-layout';

export function LoginPage() {
  const { data: config } = useServerConfig();
  const login = useLogin();
  const demo = useDemoLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      navigate('/', { replace: true });
    } catch (err) {
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
      <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
      <p className="mt-1 text-sm text-muted-foreground">Log in to continue to your budget.</p>
      <form onSubmit={submit} className="mt-8 grid gap-4">
        <Field label="E-mail" htmlFor="email">
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
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" size="lg" loading={login.isPending} className="mt-2">
          Log in
        </Button>
      </form>

      {config?.demo.enabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={tryDemo}
            loading={demo.isPending}
          >
            <Sparkles /> Explore the demo account
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Pre-filled with a year of example data. No sign-up needed.
          </p>
        </>
      )}

      {config?.registrationEnabled !== false && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          New to Slavotax?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
